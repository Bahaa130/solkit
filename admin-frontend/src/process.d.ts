// إعلان نوع بسيط لمكتبة process المستخدمة كـ polyfill في المتصفح (src/main.tsx)
declare module "process" {
  const process: any;
  export default process;
}
