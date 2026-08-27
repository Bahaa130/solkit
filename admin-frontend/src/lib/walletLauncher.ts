// src/lib/walletLauncher.ts
// 🔗 غلاف لإضافة WalletLauncher الأصلية التي تُطلق تطبيق المحفظة مباشرةً عبر
// Android Intent (مع تحديد الحزمة) متجاوزةً تبويب المتصفح المدمج الذي يتوقف عند
// صفحة ulv1.phantom.app بدل فتح التطبيق.
import { registerPlugin } from "@capacitor/core";

const WalletLauncher = registerPlugin<any>("WalletLauncher");

export async function openWalletIntent(url: string, packageName?: string): Promise<void> {
  await WalletLauncher.open({ url, packageName: packageName || null });
}
