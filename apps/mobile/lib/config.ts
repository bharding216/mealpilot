import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * In Expo Go / dev-client the manifest contains the dev server's host IP,
 * which is the same machine running the API.  We extract that so physical
 * devices can reach the API without hard-coding a LAN IP.
 */
function getDevApiUrl(): string {
  // expo-constants exposes the manifest host in SDK 57+
  const debuggerHost =
    Constants.expoConfig?.hostUri ??               // SDK 57+
    (Constants.manifest2 as any)?.extra?.expoGo?.debuggerHost ??
    (Constants.manifest as any)?.debuggerHost;

  if (debuggerHost) {
    // debuggerHost looks like "192.168.68.76:8081" — swap the port
    const host = debuggerHost.split(':')[0];
    return `http://${host}:3000`;
  }

  // Fallback for simulators / emulators
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}

export const config = {
  apiUrl: getDevApiUrl(),
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
} as const;
