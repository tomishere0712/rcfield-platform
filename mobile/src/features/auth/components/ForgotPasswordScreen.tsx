import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { ArrowRight, CheckCircle2, ChevronLeft, LockKeyhole, Mail, RotateCcw, ShieldCheck, Eye, EyeOff } from 'lucide-react-native';
import { useState, useEffect, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';

import {
  requestPasswordReset,
  resetPasswordWithCode,
  verifyPasswordResetCode,
} from '@/features/auth/api/auth.api';
import {
  forgotPasswordSchema,
  otpSchema,
  resetPasswordSchema,
  type ForgotPasswordPayload,
  type OtpPayload,
  type ResetPasswordPayload,
} from '@/shared/schemas/auth';
import { Text } from '@/shared/ui/Text';

type Step = 'email' | 'code' | 'password' | 'done';

export function ForgotPasswordScreen() {
  const { colorScheme } = useColorScheme();
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(''));
  
  const otpInputRefs = useRef<(TextInput | null)[]>([]);

  // Form hooks cho từng bước
  const emailForm = useForm<ForgotPasswordPayload>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onChange',
  });

  const otpForm = useForm<OtpPayload>({
    resolver: zodResolver(otpSchema),
    mode: 'onChange',
  });

  const passwordForm = useForm<ResetPasswordPayload>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onChange',
  });

  // Countdown timer cho OTP
  useEffect(() => {
    let timer: any;
    if (step === 'code' && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, countdown]);

  // Xử lý thay đổi ô nhập OTP
  const handleOtpChange = (index: number, val: string) => {
    const numericVal = val.replace(/[^0-9]/g, '');
    const nextDigits = [...otpDigits];
    nextDigits[index] = numericVal;
    setOtpDigits(nextDigits);

    // Ghép mã OTP lại và set giá trị cho form
    const combinedCode = nextDigits.join('');
    otpForm.setValue('code', combinedCode, { shouldValidate: true });

    // Tự động focus ô tiếp theo
    if (numericVal && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  // Xử lý nút backspace trong OTP
  const handleOtpKeyPress = (index: number, key: string) => {
    if (key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        const nextDigits = [...otpDigits];
        nextDigits[index - 1] = '';
        setOtpDigits(nextDigits);
        otpForm.setValue('code', nextDigits.join(''), { shouldValidate: true });
        otpInputRefs.current[index - 1]?.focus();
      }
    }
  };

  // Bước 1: Yêu cầu mã OTP
  const onSendEmail = async (data: ForgotPasswordPayload) => {
    setIsLoading(true);
    try {
      const normalizedEmail = data.email.trim().toLowerCase();
      await requestPasswordReset({ email: normalizedEmail });
      setEmail(normalizedEmail);
      setCountdown(60);
      setOtpDigits(Array(6).fill(''));
      otpForm.reset({ code: '' });
      setStep('code');
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || 'Không thể gửi mã xác nhận. Vui lòng kiểm tra lại email.';
      Alert.alert('Gửi mã thất bại', errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Gửi lại OTP
  const onResendCode = async () => {
    if (countdown > 0) return;
    setIsLoading(true);
    try {
      await requestPasswordReset({ email });
      setCountdown(60);
      setOtpDigits(Array(6).fill(''));
      otpForm.reset({ code: '' });
      Alert.alert('Đã gửi lại mã', `Mã OTP mới đã được gửi tới email ${email}.`);
    } catch {
      Alert.alert('Lỗi', 'Không thể gửi lại mã OTP. Vui lòng thử lại sau.');
    } finally {
      setIsLoading(false);
    }
  };

  // Bước 2: Xác nhận OTP
  const onVerifyOtp = async (data: OtpPayload) => {
    setIsLoading(true);
    try {
      await verifyPasswordResetCode({ email, code: data.code });
      setOtpCode(data.code);
      setStep('password');
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || 'Mã xác nhận không đúng hoặc đã hết hạn.';
      Alert.alert('Xác thực thất bại', errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Bước 3: Đặt lại mật khẩu mới
  const onResetPassword = async (data: ResetPasswordPayload) => {
    setIsLoading(true);
    try {
      await resetPasswordWithCode({
        email,
        code: otpCode,
        password: data.password,
      });
      setStep('done');
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || 'Mã xác nhận hết hạn. Vui lòng thực hiện lại từ đầu.';
      Alert.alert('Đặt lại mật khẩu thất bại', errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      {/* Background Glows */}
      <View className="absolute -top-20 -left-20 w-80 h-80 rounded-full bg-[#f97316]/10 blur-3xl pointer-events-none" />
      <View className="absolute bottom-10 -right-20 w-80 h-80 rounded-full bg-[#6366f1]/10 blur-3xl pointer-events-none" />

      {/* Back Button (Ẩn ở bước cuối) */}
      {step !== 'done' && (
        <View className="px-6 pt-2">
          <Pressable
            className="flex-row items-center gap-1 py-2"
            onPress={() => {
              if (step === 'email') router.push('/(auth)/login');
              if (step === 'code') setStep('email');
              if (step === 'password') setStep('code');
            }}
          >
            <ChevronLeft color={colorScheme === 'dark' ? '#94a3b8' : '#475569'} size={20} />
            <Text className="text-[14px] text-slate-500 dark:text-slate-400 font-bold">
              {step === 'email' ? 'Quay lại Đăng nhập' : 'Quay lại bước trước'}
            </Text>
          </Pressable>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow px-6 py-6 justify-center"
          keyboardShouldPersistTaps="handled"
        >
          {/* Form container */}
          <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-2xl shadow-sm">
            {step === 'email' && (
              <View className="gap-5">
                <View className="mb-2">
                  <Text className="text-slate-900 dark:text-white text-2xl font-bold" weight="700">
                    Quên mật khẩu?
                  </Text>
                  <Text className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400 leading-5" weight="500">
                    Nhập địa chỉ email của bạn, chúng tôi sẽ gửi mã xác thực OTP 6 số để thiết lập mật khẩu mới.
                  </Text>
                </View>

                {/* Email Input */}
                <View>
                  <Text className="mb-2 text-[12px] uppercase text-slate-500 dark:text-slate-300 tracking-wider" weight="700">
                    Email đăng ký
                  </Text>
                  <Controller
                    control={emailForm.control}
                    name="email"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <View className={`h-12 flex-row items-center rounded-xl border bg-slate-55 dark:bg-slate-900/80 px-3.5 focus:border-[#f97316] ${emailForm.formState.errors.email ? 'border-red-500' : 'border-slate-200 dark:border-slate-800'}`}>
                        <Mail color={emailForm.formState.errors.email ? '#ef4444' : '#94a3b8'} size={18} />
                        <TextInput
                          autoCapitalize="none"
                          autoComplete="email"
                          className="ml-2.5 flex-1 text-[14px] text-slate-900 dark:text-white font-medium"
                          editable={!isLoading}
                          keyboardType="email-address"
                          onBlur={onBlur}
                          onChangeText={onChange}
                          placeholder="name@example.com"
                          placeholderTextColor="#94a3b8"
                          value={value}
                        />
                      </View>
                    )}
                  />
                  {emailForm.formState.errors.email ? (
                    <Text className="mt-1.5 text-[12px] text-red-500" weight="600">
                      {emailForm.formState.errors.email.message}
                    </Text>
                  ) : null}
                </View>

                {/* Submit Email */}
                <Pressable
                  className={`h-12 flex-row items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-950 border border-slate-800 dark:border-[#f97316]/20 shadow-md ${!emailForm.formState.isValid || isLoading ? 'opacity-50' : 'active:bg-slate-850 dark:active:bg-slate-900'}`}
                  disabled={!emailForm.formState.isValid || isLoading}
                  onPress={emailForm.handleSubmit(onSendEmail)}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Text className="text-[14px] text-white font-bold mr-1.5" weight="700">Gửi mã xác nhận</Text>
                      <ArrowRight color="#white" size={16} />
                    </>
                  )}
                </Pressable>
              </View>
            )}

            {step === 'code' && (
              <View className="gap-5">
                <View className="mb-2">
                  <Text className="text-slate-900 dark:text-white text-2xl font-bold" weight="700">
                    Xác thực mã OTP
                  </Text>
                  <Text className="mt-1.5 text-[13px] text-slate-550 dark:text-slate-400 leading-5" weight="500">
                    Nhập mã 6 chữ số đã được gửi tới email {email}.
                  </Text>
                </View>

                {/* 6 OTP Boxes */}
                <View className="flex-row justify-between">
                  {otpDigits.map((digit, idx) => (
                    <TextInput
                      key={idx}
                      ref={(el) => {
                        otpInputRefs.current[idx] = el;
                      }}
                      className="w-11 h-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-center text-[18px] font-bold text-slate-900 dark:text-white focus:border-[#f97316]"
                      keyboardType="number-pad"
                      maxLength={1}
                      onKeyPress={({ nativeEvent }) => handleOtpKeyPress(idx, nativeEvent.key)}
                      onChangeText={(val) => handleOtpChange(idx, val)}
                      value={digit}
                    />
                  ))}
                </View>
                {otpForm.formState.errors.code ? (
                  <Text className="text-[12px] text-red-500 text-center" weight="600">
                    {otpForm.formState.errors.code.message}
                  </Text>
                ) : null}

                {/* Resend Code Button & Countdown */}
                <View className="items-center mt-1">
                  {countdown > 0 ? (
                    <Text className="text-[13px] text-slate-500 font-semibold">
                      Gửi lại mã sau {countdown} giây
                    </Text>
                  ) : (
                    <Pressable className="flex-row items-center gap-1.5" onPress={onResendCode}>
                      <RotateCcw color="#f97316" size={14} />
                      <Text className="text-[13px] text-[#f97316] font-bold">Gửi lại mã xác thực</Text>
                    </Pressable>
                  )}
                </View>

                {/* Submit OTP */}
                <Pressable
                  className={`h-12 flex-row items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-950 border border-slate-800 dark:border-[#f97316]/20 shadow-md ${!otpForm.formState.isValid || isLoading ? 'opacity-50' : 'active:bg-slate-850 dark:active:bg-slate-900'}`}
                  disabled={!otpForm.formState.isValid || isLoading}
                  onPress={otpForm.handleSubmit(onVerifyOtp)}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Text className="text-[14px] text-white font-bold mr-1.5" weight="700">Xác nhận mã</Text>
                      <ShieldCheck color="#white" size={16} />
                    </>
                  )}
                </Pressable>
              </View>
            )}

            {step === 'password' && (
              <View className="gap-5">
                <View className="mb-2">
                  <Text className="text-slate-900 dark:text-white text-2xl font-bold" weight="700">
                    Đặt mật khẩu mới
                  </Text>
                  <Text className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400 leading-5" weight="500">
                    Nhập mật khẩu mới an toàn gồm ít nhất 6 ký tự.
                  </Text>
                </View>

                {/* New Password */}
                <View>
                  <Text className="mb-2 text-[12px] uppercase text-slate-500 dark:text-slate-300 tracking-wider" weight="700">
                    Mật khẩu mới
                  </Text>
                  <Controller
                    control={passwordForm.control}
                    name="password"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <View className={`h-12 flex-row items-center rounded-xl border bg-slate-55 dark:bg-slate-900/80 px-3.5 focus:border-[#f97316] ${passwordForm.formState.errors.password ? 'border-red-500' : 'border-slate-200 dark:border-slate-800'}`}>
                        <LockKeyhole color={passwordForm.formState.errors.password ? '#ef4444' : '#94a3b8'} size={18} />
                        <TextInput
                          autoCapitalize="none"
                          className="ml-2.5 flex-1 text-[14px] text-slate-900 dark:text-white font-medium"
                          editable={!isLoading}
                          onBlur={onBlur}
                          onChangeText={onChange}
                          placeholder="••••••••"
                          placeholderTextColor="#94a3b8"
                          secureTextEntry={!showPassword}
                          value={value}
                        />
                        <Pressable onPress={() => setShowPassword(!showPassword)}>
                          {showPassword ? <EyeOff color="#94a3b8" size={18} /> : <Eye color="#94a3b8" size={18} />}
                        </Pressable>
                      </View>
                    )}
                  />
                  {passwordForm.formState.errors.password ? (
                    <Text className="mt-1.5 text-[12px] text-red-500" weight="600">
                      {passwordForm.formState.errors.password.message}
                    </Text>
                  ) : null}
                </View>

                {/* Confirm Password */}
                <View>
                  <Text className="mb-2 text-[12px] uppercase text-slate-500 dark:text-slate-300 tracking-wider" weight="700">
                    Xác nhận mật khẩu mới
                  </Text>
                  <Controller
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <View className={`h-12 flex-row items-center rounded-xl border bg-slate-55 dark:bg-slate-900/80 px-3.5 focus:border-[#f97316] ${passwordForm.formState.errors.confirmPassword ? 'border-red-500' : 'border-slate-200 dark:border-slate-800'}`}>
                        <LockKeyhole color={passwordForm.formState.errors.confirmPassword ? '#ef4444' : '#94a3b8'} size={18} />
                        <TextInput
                          autoCapitalize="none"
                          className="ml-2.5 flex-1 text-[14px] text-slate-900 dark:text-white font-medium"
                          editable={!isLoading}
                          onBlur={onBlur}
                          onChangeText={onChange}
                          placeholder="••••••••"
                          placeholderTextColor="#94a3b8"
                          secureTextEntry={!showConfirmPassword}
                          value={value}
                        />
                        <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                          {showConfirmPassword ? <EyeOff color="#94a3b8" size={18} /> : <Eye color="#94a3b8" size={18} />}
                        </Pressable>
                      </View>
                    )}
                  />
                  {passwordForm.formState.errors.confirmPassword ? (
                    <Text className="mt-1.5 text-[12px] text-red-500" weight="600">
                      {passwordForm.formState.errors.confirmPassword.message}
                    </Text>
                  ) : null}
                </View>

                {/* Submit New Password */}
                <Pressable
                  className={`h-12 flex-row items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-950 border border-slate-800 dark:border-[#f97316]/20 shadow-md mt-2 ${!passwordForm.formState.isValid || isLoading ? 'opacity-50' : 'active:bg-slate-850 dark:active:bg-slate-900'}`}
                  disabled={!passwordForm.formState.isValid || isLoading}
                  onPress={passwordForm.handleSubmit(onResetPassword)}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text className="text-[14px] text-white font-bold" weight="700">Cập nhật mật khẩu</Text>
                  )}
                </Pressable>
              </View>
            )}

            {step === 'done' && (
              <View className="items-center py-4 gap-5">
                <View className="h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 color="#10b981" size={32} />
                </View>

                <View className="items-center">
                  <Text className="text-slate-900 dark:text-white text-2xl font-bold" weight="700">
                    Đặt lại mật khẩu thành công
                  </Text>
                  <Text className="mt-2 text-[13px] text-slate-500 dark:text-slate-400 text-center leading-5" weight="500">
                    Mật khẩu của bạn đã được cập nhật thành công. Hãy đăng nhập lại bằng mật khẩu mới.
                  </Text>
                </View>

                <Pressable
                  className="h-12 w-full items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-950 border border-slate-800 dark:border-[#f97316]/20 shadow-md mt-2 active:bg-slate-850 dark:active:bg-slate-900"
                  onPress={() => router.push('/(auth)/login')}
                >
                  <Text className="text-[14px] text-white font-bold" weight="700">Về trang đăng nhập</Text>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
