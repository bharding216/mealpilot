import { Platform } from 'react-native';

const API_URL_IOS = 'http://localhost:3000';
const API_URL_ANDROID = 'http://10.0.2.2:3000';

export const config = {
  apiUrl: Platform.OS === 'android' ? API_URL_ANDROID : API_URL_IOS,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
} as const;
