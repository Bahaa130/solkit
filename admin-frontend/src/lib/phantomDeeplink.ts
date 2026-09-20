// src/lib/phantomDeeplink.ts
// 🔐 تدفّق ربط وتوقيع محفظة Phantom على الموبايل (خارج تطبيق المحفظة)
// يتبع بروتوكول Phantom Mobile Deep Links المشفّر (x25519 + nacl.box):
//   https://phantom.app/ul/v1/<method>  (وليس ulv1.phantom.app)
// وتُعاد النتيجة إلى تطبيقنا عبر مخطط مخصص app.solkit.mobile://

import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { openWalletIntent } from "./walletLauncher";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Connection } from "@solana/web3.js";
import { getNetworkConfig, rpcUrlFor } from "./network";

const SCHEME = "app.solkit.mobile";
const PHANTOM_BASE = "https://phantom.app/ul/v1";
const APP_URL = "app.solkit.mobile://";
const SESSION_KEY = "solkit_phantom_session";

// 🌐 الشبكة تُقرأ من إعدادات الخادم (تبديل devnet/mainnet-beta) ليتطابق الربط
// مع شبكة محفظة المستخدم — وإلا فشل التوقيع بخطأ عام "Unexpected error".
let cluster = "devnet";
let rpcUrl = rpcUrlFor("devnet");
let netInit: Promise<void> | null = null;
function ensureNetwork(): Promise<void> {
  if (!netInit) {
    netInit = getNetworkConfig()
      .then((cfg) => {
        cluster = cfg.network;
        rpcUrl = cfg.rpc;
      })
      .catch(() => {});
  }
  return netInit;
}

// 🔑 جلسة Phantom المشفّرة (تُنشأ عند الاتصال وتُعاد استخدامها للتوقيع)
interface PhantomSession {
  dappKeyPair: nacl.BoxKeyPair;
  sharedSecret: Uint8Array;
  session: string;
  publicKey: string;
}
let session: PhantomSession | null = null;

export function resetPhantomSession() {
  session = null;
  try { localStorage.removeItem(SESSION_KEY); } catch { /* تجاهل */ }
}

// 🔁 استعادة الجلسة المحفوظة بعد إعادة تشغيل التطبيق — بلا شاشة «ربط المحفظة» مجدداً
// (الفائدة: الضغط على «توزيع» ينتقل مباشرة إلى توقيع المعاملة داخل Phantom).
export function restorePhantomSession(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved?.dappSecret || !saved?.phantomEncPub || !saved?.session || !saved?.publicKey) return null;
    const secretKey = bs58.decode(saved.dappSecret);
    const dappKeyPair = nacl.box.keyPair.fromSecretKey(secretKey);
    const sharedSecret = nacl.box.before(bs58.decode(saved.phantomEncPub), dappKeyPair.secretKey);
    session = { dappKeyPair, sharedSecret, session: saved.session, publicKey: saved.publicKey };
    return saved.publicKey;
  } catch {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* تجاهل */ }
    session = null;
    return null;
  }
}

type Pending = {
  resolve: (params: URLSearchParams) => void;
  reject: (reason: any) => void;
  timer?: ReturnType<typeof setTimeout>;
};
const pending = new Map<string, Pending>();
let listenerRegistered = false;

function randomState(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// 🔒 تشفير كائن JSON عبر القناة المشفّرة → nonce + payload (كلاهما base58)
function encryptJson(obj: any, sharedSecret: Uint8Array): { nonceB58: string; payloadB58: string } {
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  const nonce = nacl.randomBytes(24);
  const ciphertext = nacl.box.after(plaintext, nonce, sharedSecret);
  return { nonceB58: bs58.encode(nonce), payloadB58: bs58.encode(ciphertext) };
}

// 🔓 فك تشفير استجابة Phantom (data + nonce منفصلان، كلاهما base58)
function decryptResponse(dataB58: string, nonceB58: string, sharedSecret: Uint8Array): any {
  const ciphertext = bs58.decode(dataB58);
  const nonce = bs58.decode(nonceB58);
  const plaintext = nacl.box.open.after(ciphertext, nonce, sharedSecret);
  if (!plaintext) throw new Error("decrypt_failed");
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function handleUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== SCHEME + ":") return;
    const params = new URLSearchParams(u.search);
    const state = params.get("state");
    if (!state) return;
    const p = pending.get(state);
    if (!p) return;
    pending.delete(state);
    if (p.timer) clearTimeout(p.timer);
    p.resolve(params);
  } catch {
    /* تجاهل الروابط غير الصالحة */
  } finally {
    Browser.close().catch(() => {});
  }
}

function registerListener() {
  if (listenerRegistered) return;
  listenerRegistered = true;
  App.addListener("appUrlOpen", (event: any) => handleUrl(event.url)).catch(() => {});
}

// 🚀 يفتح تطبيق Phantom مباشرةً (Intent) لطريقة معيّنة وينتظر عودة النتيجة
function openPhantomAndAwait(
  method: string,
  extraParams: Record<string, string>,
): Promise<URLSearchParams> {
  registerListener();
  return new Promise<URLSearchParams>((resolve, reject) => {
    const state = randomState();
    const redirect = `${SCHEME}://phantom?action=${method}&state=${state}`;
    const params = new URLSearchParams({ redirect_link: redirect, ...extraParams });
    const url = `${PHANTOM_BASE}/${method}?${params.toString()}`;

    const timer = setTimeout(() => {
      pending.delete(state);
      reject(new Error("wallet_timeout"));
    }, 120000);
    pending.set(state, { resolve, reject, timer });

    // أطلق التطبيق مباشرةً عبر Intent (يتجاوز تبويب المتصفح)، مع تراجع للمتصفح
    openWalletIntent(url, "com.phantom.app").catch(() =>
      Browser.open({ url }).catch(() => {
        clearTimeout(timer);
        pending.delete(state);
        reject(new Error("cannot_open_wallet"));
      }),
    );
  });
}

function assertError(params: URLSearchParams) {
  const err = params.get("errorCode");
  if (err) throw new Error(params.get("errorMessage") || "phantom_error");
}

// 🔌 اتصال: يفتح Phantom ويعرض نافذة الربط، يُرجع عنوان المحفظة ويخزّن الجلسة
export async function connectPhantomMobile(): Promise<string> {
  await ensureNetwork();
  const dappKeyPair = nacl.box.keyPair();
  const dappEncPubB58 = bs58.encode(dappKeyPair.publicKey);

  const resp = await openPhantomAndAwait("connect", {
    dapp_encryption_public_key: dappEncPubB58,
    app_url: APP_URL,
    cluster,
  });
  assertError(resp);

  const phantomEncPub = bs58.decode(resp.get("phantom_encryption_public_key")!);
  const sharedSecret = nacl.box.before(phantomEncPub, dappKeyPair.secretKey);
  const decrypted = decryptResponse(resp.get("data")!, resp.get("nonce")!, sharedSecret);

  session = {
    dappKeyPair,
    sharedSecret,
    session: decrypted.session,
    publicKey: decrypted.public_key,
  };
  // 💾 احفظ الجلسة لاستعادتها بعد إعادة تشغيل التطبيق (توقيع لحظي دون إعادة ربط)
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        dappSecret: bs58.encode(dappKeyPair.secretKey),
        phantomEncPub: bs58.encode(phantomEncPub),
        session: decrypted.session,
        publicKey: decrypted.public_key,
      })
    );
  } catch { /* تجاهل */ }
  return decrypted.public_key;
}

// ✍️ توقيع رسالة: يفتح Phantom ويعرض نافذة التوقيع، يُرجع التوقيع Base64 (كما يتوقع السيرفر)
export async function signMessagePhantomMobile(message: string): Promise<string> {
  if (!session) throw new Error("not_connected");
  const messageB58 = bs58.encode(new TextEncoder().encode(message));
  const { nonceB58, payloadB58 } = encryptJson(
    { message: messageB58, session: session.session, display: "utf8" },
    session.sharedSecret,
  );

  const resp = await openPhantomAndAwait("signMessage", {
    dapp_encryption_public_key: bs58.encode(session.dappKeyPair.publicKey),
    nonce: nonceB58,
    payload: payloadB58,
  });
  assertError(resp);

  const decrypted = decryptResponse(resp.get("data")!, resp.get("nonce")!, session.sharedSecret);
  // Phantom يُرجع التوقيع base58 → نحوّله إلى base64 للسيرفر
  return bytesToBase64(bs58.decode(decrypted.signature));
}

// 📤 توقيع وبثّ معاملة: مسار واحد حاسم — Phantom يوقّع فقط (شاشة توقيع واحدة)
// ونحن نبثّ المعاملة بأنفسنا عبر البروكسي. سبب المسار الواحد: بعض إصدارات Phantom
// على الموبايل لا تدعم signAndSendTransaction عبر الروابط المشفّرة فكانت المحفظة
// تُفتح مرتين (شاشة خطأ ثم شاشة توقيع) — الآن فتح واحد لكل معاملة دائماً.
export async function sendTransactionPhantomMobile(
  serialized: Uint8Array,
  connection?: Connection,
): Promise<string> {
  void connection; // البثّ يتم دائماً عبر البروكسي المباشر — الاتصال محفوظ للتوافق مع الواجهة
  if (!session) throw new Error("not_connected");
  const txB58 = bs58.encode(serialized);

  const { nonceB58, payloadB58 } = encryptJson(
    { transaction: txB58, session: session.session },
    session.sharedSecret,
  );
  const resp = await openPhantomAndAwait("signTransaction", {
    dapp_encryption_public_key: bs58.encode(session.dappKeyPair.publicKey),
    nonce: nonceB58,
    payload: payloadB58,
  });
  assertError(resp);
  const decrypted = decryptResponse(resp.get("data")!, resp.get("nonce")!, session.sharedSecret);
  if (!decrypted.transaction) throw new Error("no_transaction_in_response");
  return await broadcastRawTransaction(bs58.decode(decrypted.transaction as string));
}

// 📡 بثّ معاملة موقّعة عبر البروكسي (fetch مباشر — لا يعتمد على web3.js)
// 🔁 مع إعادة محاولة: خادم Render النائم قد يرد 503/429 لحظة الإيقاظ —
// نعيد المحاولة حتى يُبثّ التوقيع فعلاً قبل انتهاء صلاحية الـ blockhash.
async function broadcastRawTransaction(signedTxBytes: Uint8Array): Promise<string> {
  await ensureNetwork();
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "sendTransaction",
          params: [bs58.encode(signedTxBytes), { skipPreflight: false, maxRetries: 3 }],
        }),
      });
      const data: any = await res.json().catch(() => null);
      if (res.ok && data?.result) return data.result as string;
      // خطأ RPC تشغيلي (blockhash منتهٍ/حساب مكرر) لا يُعاد عليه — البثّ لن ينجح
      if (data?.error && !/unhealthy|rate|limit|too many|503|429/i.test(String(data.error?.message || ""))) {
        throw new Error(data.error?.message || `brodcast_http_${res.status}`);
      }
      lastErr = new Error(data?.error?.message || `brodcast_http_${res.status}`);
    } catch (e) {
      lastErr = e;
      // أخطاء غير الشبكة (blockhash منتهٍ مثلها) لا تُعاد — أرمِها فوراً
      const msg = e instanceof Error ? e.message : String(e);
      if (!/Failed to fetch|NetworkError|load failed|503|429|unhealthy|rate|limit|too many|brodcast_http/i.test(msg)) {
        throw e;
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`تعذّر بثّ المعاملة عبر الشبكة (${lastErr instanceof Error ? lastErr.message : lastErr}) — أعد المحاولة بعد قليل`);
}
