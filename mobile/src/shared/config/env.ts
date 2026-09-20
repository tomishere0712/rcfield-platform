export const env = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
  environment: process.env.EXPO_PUBLIC_ENV ?? 'development',
  googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '',
  googleClientIdAndroid: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID ?? '',
  googleClientIdIos: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS ?? '',
  easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '',
};

if (!env.apiUrl) {
  console.warn('Missing EXPO_PUBLIC_API_URL configuration. Please set it in your local .env file.');
}

if (!env.googleClientId) {
  console.warn('Missing EXPO_PUBLIC_GOOGLE_CLIENT_ID configuration. Please set it in your local .env file.');
}
