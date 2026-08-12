// src/components/games/gamesUtils.ts
// 🕐 تنسيقات مشتركة لأزرار الألعاب — دعم قفل الساعة (كولدون 3600 ثانية)

type TFunc = (key: string, vars?: Record<string, string | number>) => string;

/** تنسيق الثواني بلغة الحالية: 1س30د / 45د12ث / 8ث — يقبل دالة t لمفاتيح time.* */
export const formatCooldown = (sec: number, t?: TFunc): string => {
  const s = Math.max(0, Math.ceil(sec));
  if (s <= 0) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (t) {
    if (h > 0) return t("time.hm", { h, m });
    if (m > 0) return t("time.ms", { m, s: rem });
    return t("time.s", { s: rem });
  }
  // احتياطي عربي بدون سياق
  if (h > 0) return `${h}س ${m}د`;
  if (m > 0) return `${m}د ${rem}ث`;
  return `${rem}ث`;
};
