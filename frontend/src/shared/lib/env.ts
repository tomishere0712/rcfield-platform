export const env = {
  apiUrl: import.meta.env.VITE_API_URL as string,
  appName: import.meta.env.VITE_APP_NAME as string,
  enableMock: import.meta.env.VITE_ENABLE_MOCK === "true",
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined,
  passwordResetCodeTtlMinutes: Number(import.meta.env.VITE_PASSWORD_RESET_CODE_TTL_MINUTES ?? 30),
}
