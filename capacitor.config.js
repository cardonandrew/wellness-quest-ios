/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'com.andrewcardon.wellnessquest',
  appName: 'Wellness Quest',
  webDir: 'www',
  // No server.url — the app is fully bundled locally with on-device SQLite.
  // All ./actions calls are intercepted by native-bridge.js and routed
  // to the native-actions.js SQLite implementation.
  ios: {
    contentInset: 'always',
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0a0a12',
      showSpinner: false,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0a0a12',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
    },
  },
};

module.exports = config;
