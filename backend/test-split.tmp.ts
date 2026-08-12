import "dotenv/config";
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, PublicKey } from "@solana/web3.js";
import { prisma } from "./src/config/prisma.js";

const API = "http://127.0.0.1:4000";
const RPC = process.env.SOLANA_RPC_URL || process.env.RPC_URL || "https://api.devnet.solana.com";
const ADMIN_WALLET = "4NC1c6ZUrpTibV1FuxomBstGbkjXWNYtJwYvbFezKuQo";

const conn = new Connection(RPC, "confirmed");

async function loginWallet(walletAddress: string, referralCode?: string | null) {
  const res = await fetch(`${API}/api/users/login-wallet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, referralCode: referralCode ?? null }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`login-wallet failed (${res.status}): ${JSON.stringify(data)}`);
  return data as { token: string; user: any };
}

async function airdrop(pubkey: string, sol: number) {
  const sig = await conn.requestAirdrop(new PublicKey(pubkey), Math.floor(sol * LAMPORTS_PER_SOL));
  await conn.confirmTransaction(sig, "confirmed");
  console.log(`  ✅ airdropped ${sol} SOL to ${pubkey}`);
}

async function buildAndSend(payer: Keypair, transfers: { to: string; lamports: number }[]) {
  const tx = new Transaction();
  for (const t of transfers) {
    tx.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: new PublicKey(t.to), lamports: t.lamports }));
  }
  tx.feePayer = payer.publicKey;
  const bh = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = bh.blockhash;
  const sig = await conn.sendTransaction(tx, [payer], { preflightCommitment: "confirmed" });
  await conn.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, "confirmed");
  console.log(`  ✅ tx sent: ${sig}`);
  return sig;
}

async function activate(token: string, txHash: string) {
  const res = await fetch(`${API}/api/users/activate-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ txHash }),
  });
  const body = await res.text();
  console.log(`  ↳ activate-account (${res.status}): ${body}`);
  if (!res.ok) throw new Error(`activate failed: ${body}`);
  return JSON.parse(body);
}

(async () => {
  console.log("=== TEST 1: WITH REFERRER → split 0.005 site / 0.005 referrer ===");

  // Referrer B (wallet only)
  const refKeypair = Keypair.generate();
  const refPub = refKeypair.publicKey.toBase58();
  await loginWallet(refPub, null);
  const refUser = await prisma.user.findUnique({ where: { walletAddress: refPub } });
  if (!refUser) throw new Error("referrer user not created");
  const refCode = refUser.referralCode;
  console.log(`  referrer B id=${refUser.id} code=${refCode}`);

  // User A registers via B's referral link
  const userKeypair = Keypair.generate();
  const userPub = userKeypair.publicKey.toBase58();
  await airdrop(userPub, 0.05);
  const userLogin = await loginWallet(userPub, refCode);
  const userA = await prisma.user.findUnique({ where: { walletAddress: userPub } });
  if (!userA) throw new Error("user A not created");
  console.log(`  user A id=${userA.id} referrerId=${userA.referrerId}`);
  if (userA.referrerId !== refUser.id) throw new Error("referrerId NOT set on A!");

  // Verify GET /:id now returns the referrer wallet (the core fix)
  const checkRes = await fetch(`${API}/api/users/${userA.id}`);
  const checkData = await checkRes.json();
  console.log(`  GET /:id referrer = ${JSON.stringify(checkData?.referrer)}`);
  if (checkData?.referrer?.walletAddress !== refPub) throw new Error("GET /:id did not return referrer wallet!");

  // Split transaction: 0.005 → site, 0.005 → referrer
  const sig1 = await buildAndSend(userKeypair, [
    { to: ADMIN_WALLET, lamports: 5000000 },
    { to: refPub, lamports: 5000000 },
  ]);
  await activate(userLogin.token, sig1);

  const ua = await prisma.user.findUnique({ where: { id: userA.id } });
  const refAfter = await prisma.user.findUnique({ where: { id: refUser.id } });
  console.log(`  A activationStatus=${ua?.activationStatus} | B balance=${refAfter?.balance}`);
  const payA = await (prisma as any).payment.findMany({ where: { userId: userA.id }, orderBy: { id: "asc" } });
  const payB = await (prisma as any).payment.findMany({ where: { userId: refUser.id }, orderBy: { id: "asc" } });
  console.log(`  A payment rows: ${JSON.stringify(payA.map((p: any) => ({ amount: Number(p.amount), txHash: p.txHash })))}`);
  console.log(`  B payment rows: ${JSON.stringify(payB.map((p: any) => ({ amount: Number(p.amount), txHash: p.txHash })))}`);
  if (ua?.activationStatus !== "active") throw new Error("A not active!");

  console.log("\n=== TEST 2: WITHOUT REFERRER → full 0.01 to site wallet ===");
  const noRefKeypair = Keypair.generate();
  const noRefPub = noRefKeypair.publicKey.toBase58();
  await airdrop(noRefPub, 0.05);
  const noRefLogin = await loginWallet(noRefPub, null);
  const noRefUser = await prisma.user.findUnique({ where: { walletAddress: noRefPub } });
  if (!noRefUser) throw new Error("user C not created");
  console.log(`  user C id=${noRefUser.id} referrerId=${noRefUser.referrerId}`);

  const sig2 = await buildAndSend(noRefKeypair, [{ to: ADMIN_WALLET, lamports: 10000000 }]);
  await activate(noRefLogin.token, sig2);

  const uc = await prisma.user.findUnique({ where: { id: noRefUser.id } });
  const payC = await (prisma as any).payment.findMany({ where: { userId: noRefUser.id }, orderBy: { id: "asc" } });
  console.log(`  C activationStatus=${uc?.activationStatus}`);
  console.log(`  C payment rows: ${JSON.stringify(payC.map((p: any) => ({ amount: Number(p.amount), txHash: p.txHash })))}`);
  if (uc?.activationStatus !== "active") throw new Error("C not active!");

  await prisma.$disconnect();
  console.log("\n✅ ALL TESTS PASSED");
})().catch(async (e) => {
  console.error("\n❌ TEST FAILED:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
