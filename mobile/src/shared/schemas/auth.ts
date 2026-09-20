import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1, 'Vui lòng nhập email').email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu phải chứa ít nhất 6 ký tự'),
});

export type LoginPayload = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    fullName: z.string().min(2, 'Họ và tên phải chứa ít nhất 2 ký tự'),
    email: z.string().min(1, 'Vui lòng nhập email').email('Email không hợp lệ'),
    phoneNumber: z
      .string()
      .min(1, 'Vui lòng nhập số điện thoại')
      .regex(/(84|0[3|5|7|8|9])+([0-9]{8})\b/, 'Số điện thoại không đúng định dạng Việt Nam'),
    password: z.string().min(6, 'Mật khẩu phải chứa ít nhất 6 ký tự'),
    confirmPassword: z.string().min(1, 'Vui lòng nhập lại mật khẩu xác nhận'),
    agreeToTerms: z.boolean().refine((val) => val === true, {
      message: 'Bạn phải đồng ý với Điều khoản & Chính sách bảo mật',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không trùng khớp',
    path: ['confirmPassword'],
  });

export type RegisterPayload = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Vui lòng nhập email').email('Email không hợp lệ'),
});

export type ForgotPasswordPayload = z.infer<typeof forgotPasswordSchema>;

export const otpSchema = z.object({
  code: z
    .string()
    .min(1, 'Vui lòng nhập mã xác nhận')
    .regex(/^\d{6}$/, 'Mã xác nhận phải gồm đúng 6 chữ số'),
});

export type OtpPayload = z.infer<typeof otpSchema>;

export const resetPasswordSchema = z
  .object({
    password: z.string().min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự'),
    confirmPassword: z.string().min(1, 'Vui lòng xác nhận lại mật khẩu'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không trùng khớp',
    path: ['confirmPassword'],
  });

export type ResetPasswordPayload = z.infer<typeof resetPasswordSchema>;
