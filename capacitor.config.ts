import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vegseal.app',
  appName: 'VegSeal',
  // Capacitor requires a web assets folder containing index.html.
  // This app is server-rendered, so we ship a tiny offline fallback page here
  // and load the live hosted app through server.url below.
  webDir: 'native',
  server: {
    url: 'https://vegseal.com',
    cleartext: false,
    // Shown from the app bundle when the site can't be reached (offline).
    errorPath: 'index.html',
  },
  plugins: {
    SplashScreen: { launchAutoHide: true },
  },
  ios: {
    contentInset: 'always',
  },
};

export default config;
