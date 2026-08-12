// backend/scripts/setup-token.ts
// 🪙 إنشاء توكن SOLKIT على شبكة سولانا (إعداد لمرة واحدة) وصكّ العرض لمحفظة الخزانة
//
// الاستخدام:
//   npx tsx scripts/setup-token.ts                     ← توليد مفتاح مؤقت + airdrop على devnet
//   npx tsx scripts/setup-token.ts --keypair ./dev-payer.json   ← إعادة تشغيل بمفتاح مموّل
//
// يقرأ من .env: ADMIN_WALLET (الخزانة)، SOLANA_NETWORK، TOKEN_DECIMALS، TOKEN_SUPPLY
// بعد النجاح يضيف TOKEN_MINT تلقائياً إلى .env ويعيد تشغيل الخلفية لالتقاطه.

import fs from "fs";
import path from "path";
import "dotenv/config";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const NETWORK = process.env.SOLANA_NETWORK || "devnet";
const DECIMALS = Number(process.env.TOKEN_DECIMALS || 9);
const SUPPLY = Number(process.env.TOKEN_SUPPLY || 1_000_000); // إجمالي العرض بوحدات التوكن
const ADMIN_WALLET = process.env.ADMIN_WALLET;

const argKeypair = (() => {
  const i = process.argv.indexOf("--keypair");
  return i > -1 ? process.argv[i + 1] : null;
})();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!ADMIN_WALLET) throw new Error("ADMIN_WALLET غير مضبوط في .env!");
  const connection = new Connection(RPC, "confirmed");
  const admin = new PublicKey(ADMIN_WALLET);

  // 1) دافع الرسوم: مفتاح ممرَّر أو مفتاح مؤقت مع airdrop
  let payer: Keypair;
  if (argKeypair) {
    payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(argKeypair, "utf-8"))));
    console.log("🔑 دافع الرسوم:", payer.publicKey.toBase58());
  } else {
    payer = Keypair.generate();
    console.log("🚀 مفتاح مؤقت لتغطية رسوم الإنشاء:", payer.publicKey.toBase58());
    try {
      await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
      console.log("💸 تم تمويل المفتاح المؤقت (2 SOL)");
    } catch {
      const tmp = path.join(process.cwd(), "dev-payer.json");
      fs.writeFileSync(tmp, JSON.stringify(Array.from(payer.secretKey)));
      throw new Error(
        `فشل الـ airdrop (faucet غير متاح غالباً).\n` +
        `تم حفظ المفتاح المؤقت في ${tmp}.\n` +
        `موله بأي محفظة على ${NETWORK} ثم شغّل:\n  npx tsx scripts/setup-token.ts --keypair ${tmp}`
      );
    }
    await sleep(2000); // انتظار استقرار الـ airdrop
  }

  // 2) إنشاء التوكن (سلطة الصك مؤقتاً = الدافع، ثم تُنقل للمدير)
  console.log("🪙 إنشاء التوكن...");
  const mint = await createMint(connection, payer, payer.publicKey, null, DECIMALS);
  console.log("✅ Mint:", mint.toBase58());

  // 3) حساب الخزانة المرتبط (ATA لمحفظة المدير)
  console.log("💰 إنشاء حساب الخزانة (ATA)...");
  const treasuryAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, admin);
  console.log("✅ Treasury ATA:", treasuryAta.address.toBase58());

  // 4) صكّ العرض الكامل إلى الخزانة (الدافع يوقّع كسلطة صك)
  const rawAmount = BigInt(Math.round(SUPPLY * 10 ** DECIMALS));
  console.log(`⛏️ صك ${SUPPLY} توكن للخزانة...`);
  await mintTo(connection, payer, mint, treasuryAta.address, payer.publicKey, rawAmount);
  console.log("✅ تم الصك");

  // 5) نقل سلطة الصك إلى محفظة المدير (الدافع يوقّع النقل)
  console.log("🔐 نقل سلطة الصك إلى محفظة المدير...");
  await setAuthority(connection, payer, mint, payer.publicKey, AuthorityType.MintTokens, admin);
  console.log("✅ صار المدير سلطة الصك الوحيدة");

  // 6) إضافة TOKEN_MINT إلى .env
  const envPath = path.join(process.cwd(), ".env");
  const newLines = `\n# 🪙 إعداد توكن SOLKIT (أُنشئ عبر سكربت setup-token)\nTOKEN_MINT=${mint.toBase58()}\nTOKEN_DECIMALS=${DECIMALS}\nSOLANA_NETWORK=${NETWORK}\n`;
  fs.appendFileSync(envPath, newLines);
  console.log("✔ تمت إضافة TOKEN_MINT إلى .env تلقائياً");

  console.log("\n🎉 تم إعداد التوكن بنجاح! أعد تشغيل الخلفية لالتقاط الإعدادات.");
  console.log(`🔗 معاينة: https://solscan.io/token/${mint.toBase58()}?cluster=devnet`);
}

main().catch((e) => {
  console.error("✖", e.message || e);
  process.exit(1);
});
