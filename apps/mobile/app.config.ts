import type { ExpoConfig, ConfigContext } from 'expo/config';

const IS_DEV = process.env.APP_VARIANT === 'development';
const BUNDLE_ID = IS_DEV ? 'com.mealpilot.app.dev' : 'com.mealpilot.app';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? 'MealPilot Dev' : 'MealPilot',
  slug: 'mealpilot',
  owner: 'bharding80',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  scheme: IS_DEV ? 'mealpilot-dev' : 'mealpilot',
  ios: {
    supportsTablet: false,
    bundleIdentifier: BUNDLE_ID,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#333333',
    },
    package: BUNDLE_ID,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-system-ui',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        backgroundColor: '#333333',
      },
    ],
  ],
  updates: {
    url: 'https://u.expo.dev/38d1f3e4-cf11-493e-864d-a8b68b6b9e1a',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: '38d1f3e4-cf11-493e-864d-a8b68b6b9e1a',
    },
  },
});
