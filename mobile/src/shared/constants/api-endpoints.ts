export const API_ENDPOINTS = {
  auth: {
    login: '/auth/login',
    logout: '/auth/logout',
    refresh: '/auth/refresh',
    me: '/auth/me',
    register: '/auth/register',
    google: '/auth/google',
    forgotPassword: '/auth/forgot-password',
    verifyResetCode: '/auth/forgot-password/verify',
    resetPassword: '/auth/reset-password',
    changePassword: '/auth/change-password',
  },
  bookings: {
    root: '/bookings',
  },
  uploads: {
    images: '/uploads/images',
  },
} as const;
