// src/lib/api.ts
// 🌐 طبقة طلبات موحّدة: داخل WebView الخاص بـ Capacitor (origin = https://localhost)
// لا تُحلّ المسارات النسبية "/api/..." إلى الخلفية المنشورة، لذا نضيف بادئة VITE_API_URL
// وقت البناء. عند ترك المتغيّر فارغاً (تطوير Vite) تبقى المسارات النسبية عبر الـ proxy.

const API_BASE = ((import.meta.env?.VITE_API_URL as string | undefined) ?? "").replace(/\/+$/, "");

/** نفس توقيع fetch لكن مع بادئة الخادم عند تعيينها. */
export const apiFetch = (path: string, opts?: RequestInit): Promise<Response> =>
  fetch(`${API_BASE}${path}`, opts);

/** جلب JSON مع رمي رسالة الخادم العربي عند الفشل (نمط gamesApi). */
export async function apiJson<T = any>(
  path: string,
  opts?: RequestInit
): Promise<T> {
  const res = await apiFetch(path, opts);
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      `تعذّر الاتصال بالخادم (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : "تعذّر الاتصال بالخادم");
  }
  return data as T;
}
