import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.solkit.mobile',
  appName: 'SOLKIT',
  webDir: 'dist',
  server: {
    // أصل https://localhost داخل WebView يحسّن توافق محافظ سولانا (Phantom) مقارنة بـ capacitor://
    androidScheme: 'https',
  },
};

export default config;
