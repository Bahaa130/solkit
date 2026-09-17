// src/lib/tabIcons.ts
// 🎨 أيقونات تبويبات الشريط السفلي مضمّنة محلياً داخل الكود (data URI)
// بدل الاعتماد على خدمة iconify الخارجية (api.iconify.design) التي قد تُحجب أو تبطؤ
// في بعض المناطق — ما كان يخفي أيقونات الشريط في الموقع النشط.

const toDataUri = (svg: string) =>
  "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

// مأخوذة من مكتبة MDI (Material Design Icons) — أفلام داخلية (fill) سوداء يبيّضها
// فلتـر brightness(0) invert(1) المطبّق في الشريط.
export const TAB_ICONS: Record<string, string> = {
  home: toDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3L2 12h3v8z"/></svg>`,
  ),
  airdrop: toDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M21.2 10.95L12 23L2.78 10.96l.09-.08c.21-.21.46-.38.71-.52l7.15 9.33L8.58 13l.66-1.19L12 20.38l2.73-8.58l.67 1.2l-2.13 6.69l7.14-9.34c.25.15.49.29.69.5zM5 9c1.5 0 2.81.86 3.5 2.1A3.97 3.97 0 0 1 12 9c1.5 0 2.8.85 3.5 2.09A3.93 3.93 0 0 1 19 9c1.09 0 2.09.42 2.81 1.14C20.94 5.5 16.88 2 12 2c-4.91 0-8.97 3.5-9.84 8.17C2.89 9.45 3.89 9 5 9"/></svg>`,
  ),
  referral: toDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7a5 5 0 0 0-5 5a5 5 0 0 0 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1M8 13h8v-2H8zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4a5 5 0 0 0 5-5a5 5 0 0 0-5-5"/></svg>`,
  ),
  tasks: toDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M9.06 1.93C7.17 1.92 5.33 3.74 6.17 6H3a2 2 0 0 0-2 2v2a1 1 0 0 0 1 1h9V8h2v3h9a1 1 0 0 0 1-1V8a2 2 0 0 0-2-2h-3.17C19 2.73 14.6.42 12.57 3.24L12 4l-.57-.78c-.63-.89-1.5-1.28-2.37-1.29M9 4c.89 0 1.34 1.08.71 1.71S8 5.89 8 5a1 1 0 0 1 1-1m6 0c.89 0 1.34 1.08.71 1.71S14 5.89 14 5a1 1 0 0 1 1-1M2 12v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-8h-9v8h-2v-8z"/></svg>`,
  ),
  bonus: toDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M19 19H5V8h14m-3-7v2H8V1H6v2H5c-1.11 0-2 .89-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-1V1m-1 11h-5v5h5z"/></svg>`,
  ),
  ico: toDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="m13.16 22.19l-1.66-3.84c1.6-.58 3.07-1.35 4.43-2.27l-2.78 6.11m-7.5-9.69l-3.84-1.65l6.11-2.78a20 20 0 0 0-2.27 4.43M21.66 2.35S23.78 7.31 18.11 13c-2.2 2.17-4.58 3.5-6.73 4.34c-.74.28-1.57.1-2.12-.46l-2.13-2.13c-.56-.56-.74-1.38-.47-2.13C7.5 10.5 8.83 8.09 11 5.89C16.69.216 21.66 2.35 21.66 2.35M6.25 22H4.84l4.09-4.1c.3.21.63.36.97.45zM2 22v-1.41l4.77-4.78l1.43 1.42L3.41 22zm0-2.84v-1.41l3.65-3.65c.09.35.24.68.45.97zM16 6a2 2 0 1 0 0 4c1.11 0 2-.89 2-2a2 2 0 0 0-2-2"/></svg>`,
  ),
  admin: toDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14z"/></svg>`,
  ),
};