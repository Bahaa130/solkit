// backend/src/modules/users/contentEn.ts
// 🌍 ترجمة المحتوى المُدار إلى الإنجليزية
//
// المشكلة: نصوص لوحة المدير (المستويات، اقتصاديات التوكن، خارطة الطريق، الكارتات،
// صفحة الاكتتاب) كُتبت بالعربية داخل القيم الافتراضية، فكانت تُعرض للمستخدم العربي
// فقط. المطلوب: محتوى إنجليزي افتراضي مع بقاء صلاحية المدير في التعديل.
//
// الحل: نُطبّع النصوص إلى الإنجليزية عند كل قراءة، لكن **ن arterial القائمة الملونة**
// المطابقة حرفاً بحرف — فلو كتب المدير نصاً خاصاً به لم نلمسه، وإن أعاد كلمة
// افتراضية بالإنجليزية مرّ من غير تغيير.thus تتم الترقية تلقائياً على الإنتاج
// بلا زر ولا صلاحية، مع بقاء كل تعديلات المدير اللاحقة كما هي.

/** 🗺️ القيم الافتراضية القديمة (عربية) ← البديل الإنجليزي المعتمد */
const AR_TO_EN: Record<string, string> = {
  // ── المستويات ──
  "المبتدئ": "Beginner",
  "المبتدئ+": "Beginner+",
  "النشط": "Active",
  "المتقدم": "Advanced",
  "المحترف": "Professional",
  "الخبير": "Expert",
  "الأسطوري": "Legendary",
  "الفخري": "Prestige",
  "القمة": "Summit",

  // ── خارطة الطريق ──
  "بناء النظام الأساسي": "Core System Build",
  "تفعيل أمني + اختبار": "Security Audit + Testing",
  "إطلاق النسخة التجريبية": "Beta Launch",
  "إطلاق النسخة الكاملة": "Full Launch",
  "التوسع والبورصات": "Expansion & Exchanges",

  // ── اقتصاديات التوكن ──
  "التعدين": "Mining",
  "التعدين والأنشطة": "Mining & Activities",
  "الألعاب": "Games",
  "المجتمع": "Community",
  "الفريق": "Team",
  "السيولة": "Liquidity",
  "الاكتتاب": "ICO",
  "الفريق والمستشارون": "Team & Advisors",
  "التسويق والمجتمع": "Marketing & Community",
  "خزينة العمليات": "Operations Treasury",

  // ── كارتات الدخل ──
  "مؤثرون للتسويق": "Influencer Marketing",
  "فيديو ترويجي": "Promotional Video",
  "لافتات إعلانية": "Banner Ads",
  "قنوات تيليجرام": "Telegram Channels",
  "كوبونات خصم": "Discount Coupons",
  "إعلان تلفزيوني": "TV Advertisement",

  // ── صفحة الاكتتاب ──
  "اكتتاب مشاركة مبكرة 🚀": "Early Participation Sale 🚀",
  "اشترِ توكن {token} بسعر ما قبل الطرح وكن أول المستثمرين في المنصة.":
    "Buy {token} tokens at the pre-sale price and be among the first investors in the platform.",
  "رحلة المشاركة المبكرة في توكن {token}: اطلب توكناتك قبل إدراجها في البورصات، وادفع بالـ SOL مباشرة من محفظتك، واحصل على مصاتك وفق جدول الاستحقاق.":
    "The early participation journey for the {token} token: request your tokens before exchange listing, pay directly in SOL from your wallet, and receive your allocation following the vesting schedule.",
  "سعر تفضيلي": "Preferential Price",
  "سعر أقل من سعر الإدراج المتوقّع في البورصات.": "A price below the expected exchange listing price.",
  "أولوية الحجز": "Reservation Priority",
  "مخصصاتك تُحجز باسمك فور التأكيد على السلسلة.": "Your allocation is reserved in your name as soon as it is confirmed on-chain.",
  "مكافآت إحالة": "Referral Bonuses",
  "شارك رابطك واحصل على علاوات إضافية.": "Share your link and earn additional bonuses.",
  "متى أستلم توكناتي؟": "When do I receive my tokens?",
  "تُسجَّل مخصصاتك فور تأكيد الدفع على البلوكشين، وتُفرج وفق جدول الاستحقاق بعد الإدراج.":
    "Your allocation is recorded as soon as the payment is confirmed on-chain, and is released according to the vesting schedule after listing.",
  "هل يُسترد المبلغ إذا لم تكتمل اللوحة؟": "Is the amount refunded if the round does not complete?",
  "إذا لم يصل الاكتتاب إلى الهدف الأدنى، تُعاد العمليات بعد الإغلاق دون رسوم.":
    "If the sale does not reach its soft cap, transactions are returned after the close with no fees.",
  "عند الإدراج (TGE)": "At Listing (TGE)",
  "فوراً": "Immediately",
  "الدفعة الثانية": "Second Tranche",
  "الدفعة الثالثة": "Third Tranche",
  "الدفعة النهائية": "Final Tranche",
  "بعد 3 أشهر": "After 3 months",
  "بعد 6 أشهر": "After 6 months",
  "بعد 12 شهراً": "After 12 months",
  "دفعات الاكتتاب تُرسل إلى محفظة الخزانة على البلوكشين وتُوثَّق تلقائياً بين التطبيق والخادم. التوكنات الرقمية قد ترتفع أو تنخفض قيمتها ولا نضمن أداءً خاصاً. تفحص الأهلية والقوانين في بلدك قبل المشاركة.":
    "Sale payments are sent to the on-chain treasury wallet and are recorded automatically between the app and the server. Digital tokens may rise or fall in value and we guarantee no specific performance. Verify eligibility and local regulations in your country before participating.",

  // ── الصيانة ──
  "نحن نجري صيانة مجدولة. سنعود قريباً! 🔧": "Scheduled maintenance in progress. Back shortly! 🔧",
  "🔧 وضع الصيانة": "🔧 Maintenance mode",
};

/**
 * ♻️ استبدال كل قيمة تطابق افتراضياً عربياً بنظيرتها الإنجليزية (بما في ذلك داخل
 * المصفوفات والكائنات المتداخلة). القيم التي كتبها المدير بنفسه تبقى كما هي.
 */
export function toEnglishContent<T>(value: T): T {
  if (typeof value === "string") {
    return (AR_TO_EN[value] ?? value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => toEnglishContent(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toEnglishContent(v);
    }
    return out as unknown as T;
  }
  return value;
}

/** 📊 عدّ الحقول المترجمة (للتشخيص فقط) */
export function countEnglishMappings(): number {
  return Object.keys(AR_TO_EN).length;
}
