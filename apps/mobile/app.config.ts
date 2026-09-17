import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'MealPilot',
  slug: 'mealpilot',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  splash: {
    backgroundColor: '#1B5E20',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.mealpilot.app',
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#1B5E20',
    },
    package: 'com.mealpilot.app',
  },
  scheme: 'mealpilot',
  plugins: [
    'expo-router',
    'expo-secure-store',
  ],
});
