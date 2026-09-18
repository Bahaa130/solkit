import "dotenv/config";
import app from "./app.js";
import { hydrateSettingsFromDb } from "./config/settings.js";

const PORT = Number(process.env.PORT || 4000);

// 🗄️ نحمّل إعدادات الموقع من قاعدة البيانات قبل فتح الخادم للطلبات —
// حتى لا تتراجع تغييرات المدير (مثل تفعيل الاكتتاب) بعد إعادة تشغيل Render.
async function main() {
  await hydrateSettingsFromDb();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error("Startup error:", err);
  process.exit(1);
});