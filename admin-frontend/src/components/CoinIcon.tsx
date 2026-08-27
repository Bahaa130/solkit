// src/components/CoinIcon.tsx
// 🖼️ أيقونة العملة: تعرض صورة الأيقونة المرفوعة من المدير، أو الإيموجي الافتراضي 💎

import { useBranding } from "../branding";

export default function CoinIcon({ size = 20, style }: { size?: number; style?: React.CSSProperties }) {
  const { branding } = useBranding();

  if (branding.tokenIcon) {
    return (
      <img
        src={branding.tokenIcon}
        alt={branding.tokenSymbol}
        width={size}
        height={size}
        style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0, ...style }}
      />
    );
  }

  return (
    <span style={{ fontSize: size, lineHeight: 1, flexShrink: 0, ...style }}>💎</span>
  );
}
