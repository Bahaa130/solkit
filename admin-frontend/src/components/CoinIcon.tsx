// src/components/CoinIcon.tsx
// 🖼️ أيقونة العملة: تعرض صورة الأيقونة المرفوعة من المدير، أو الإيموجي الافتراضي 💎

import { useBranding } from "../branding";

// 📏 تكبير طفيف وموحّد لكل أيقونات العملة في التطبيق (≈ +22%)
//    أضيق عرض في الواجهة كان 68px، فدقة 256px تعطي حوافاً نظيفة على شاشات 3x.
const ICON_SCALE = 1.22;

export default function CoinIcon({ size = 20, style }: { size?: number; style?: React.CSSProperties }) {
  const { branding } = useBranding();
  const px = Math.round(size * ICON_SCALE);

  if (branding.tokenIcon) {
    return (
      <img
        src={branding.tokenIcon}
        alt={branding.tokenSymbol}
        width={px}
        height={px}
        style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0, ...style }}
      />
    );
  }

  return (
    <span style={{ fontSize: px, lineHeight: 1, flexShrink: 0, ...style }}>💎</span>
  );
}
