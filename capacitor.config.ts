import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mouradsville.game',
  appName: "Mourad's Ville",
  webDir: '.output/public',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      showSpinner: false
    }
  }
};

export default config;
