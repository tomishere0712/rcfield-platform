import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, LockKeyhole, Mail, User, Phone, ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';

import { registerSchema, type RegisterPayload } from '@/shared/schemas/auth';
import { useAuthStore } from '@/shared/store/auth-store';
import { Text } from '@/shared/ui/Text';

export function RegisterScreen() {
  const { colorScheme } = useColorScheme();
  const router = useRouter();
  const registerUser = useAuthStore((state) => state.registerUser);
  const isLoading = useAuthStore((state) => state.isLoading);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<RegisterPayload>({
    resolver: zodResolver(registerSchema),
    mode: 'onChange', // Kích hoạt validation inline
    defaultValues: {
      fullName: '',
      email: '',
      phoneNumber: '',
      password: '',
      confirmPassword: '',
      agreeToTerms: false,
    },
  });

  const onSubmit = async (data: RegisterPayload) => {
    try {
      // Gọi API đăng ký với role mặc định là customer
      await registerUser({
        fullName: data.fullName.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phoneNumber.trim(),
        password: data.password,
        role: 'customer',
      });

      Alert.alert(
        'Đăng ký thành công',
        `Chào mừng ${data.fullName} đến với RCField!`,
        [
          {
            text: 'Bắt đầu ngay',
            onPress: () => router.replace('/(tabs)'),
          },
        ]
      );
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || 'Không thể đăng ký tài khoản. Vui lòng kiểm tra lại thông tin.';
      Alert.alert('Đăng ký thất bại', errMsg);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      {/* Background Glows */}
      <View className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-[#f97316]/10 blur-3xl pointer-events-none" />
      <View className="absolute bottom-10 -left-20 w-80 h-80 rounded-full bg-[#6366f1]/10 blur-3xl pointer-events-none" />

      {/* Nút quay lại trang đăng nhập */}
      <View className="px-6 pt-2">
        <Pressable
          className="flex-row items-center gap-1 py-2"
          onPress={() => router.push('/(auth)/login')}
        >
          <ChevronLeft color={colorScheme === 'dark' ? '#94a3b8' : '#475569'} size={20} />
          <Text className="text-[14px] text-slate-500 dark:text-slate-400 font-bold">Quay lại Đăng nhập</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow px-6 py-6"
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View className="mb-6 mt-2">
            <View className="mb-4">
              <Image
                source={require('../../../../assets/images/rcfield-logo.png')}
                className="h-14 w-14 rounded-2xl"
                resizeMode="cover"
              />
            </View>
            <Text className="text-slate-900 dark:text-white text-3xl" variant="title" weight="700">
              Đăng ký thành viên
            </Text>
            <Text className="mt-2 text-[14px] leading-5 text-slate-500 dark:text-slate-400" weight="500">
              Chỉ mất 30 giây để tạo tài khoản Customer và tham gia cộng đồng đua xe chuyên nghiệp.
            </Text>
          </View>

          {/* Form */}
          <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-2xl mb-8">
            <View className="gap-5">
              {/* Họ tên */}
              <View>
                <Text className="mb-2 text-[12px] uppercase text-slate-500 dark:text-slate-300 tracking-wider" weight="700">
                  Họ và tên
                </Text>
                <Controller
                  control={control}
                  name="fullName"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <View className={`h-12 flex-row items-center rounded-xl border bg-slate-55 dark:bg-slate-900/80 px-3.5 focus:border-[#f97316] ${errors.fullName ? 'border-red-500' : 'border-slate-200 dark:border-slate-800'}`}>
                      <User color={errors.fullName ? '#ef4444' : '#94a3b8'} size={18} strokeWidth={2} />
                      <TextInput
                        className="ml-2.5 flex-1 text-[14px] text-slate-900 dark:text-white font-medium py-0"
                        editable={!isLoading}
                        onBlur={onBlur}
                        onChangeText={onChange}
                        placeholder="Nguyễn Văn A"
                        placeholderTextColor="#94a3b8"
                        value={value}
                      />
                    </View>
                  )}
                />
                {errors.fullName ? (
                  <Text className="mt-1.5 text-[12px] text-red-500" weight="600">
                    {errors.fullName.message}
                  </Text>
                ) : null}
              </View>

              {/* Email */}
              <View>
                <Text className="mb-2 text-[12px] uppercase text-slate-500 dark:text-slate-300 tracking-wider" weight="700">
                  Email
                </Text>
                <Controller
                  control={control}
                  name="email"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <View className={`h-12 flex-row items-center rounded-xl border bg-slate-55 dark:bg-slate-900/80 px-3.5 focus:border-[#f97316] ${errors.email ? 'border-red-500' : 'border-slate-200 dark:border-slate-800'}`}>
                      <Mail color={errors.email ? '#ef4444' : '#94a3b8'} size={18} strokeWidth={2} />
                      <TextInput
                        autoCapitalize="none"
                        autoComplete="email"
                        className="ml-2.5 flex-1 text-[14px] text-slate-900 dark:text-white font-medium py-0"
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
                {errors.email ? (
                  <Text className="mt-1.5 text-[12px] text-red-500" weight="600">
                    {errors.email.message}
                  </Text>
                ) : null}
              </View>

              {/* Số điện thoại */}
              <View>
                <Text className="mb-2 text-[12px] uppercase text-slate-500 dark:text-slate-300 tracking-wider" weight="700">
                  Số điện thoại
                </Text>
                <Controller
                  control={control}
                  name="phoneNumber"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <View className={`h-12 flex-row items-center rounded-xl border bg-slate-55 dark:bg-slate-900/80 px-3.5 focus:border-[#f97316] ${errors.phoneNumber ? 'border-red-500' : 'border-slate-200 dark:border-slate-800'}`}>
                      <Phone color={errors.phoneNumber ? '#ef4444' : '#94a3b8'} size={18} strokeWidth={2} />
                      <TextInput
                        className="ml-2.5 flex-1 text-[14px] text-slate-900 dark:text-white font-medium py-0"
                        editable={!isLoading}
                        keyboardType="phone-pad"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        placeholder="0987654321"
                        placeholderTextColor="#94a3b8"
                        value={value}
                      />
                    </View>
                  )}
                />
                {errors.phoneNumber ? (
                  <Text className="mt-1.5 text-[12px] text-red-500" weight="600">
                    {errors.phoneNumber.message}
                  </Text>
                ) : null}
              </View>

              {/* Mật khẩu */}
              <View>
                <Text className="mb-2 text-[12px] uppercase text-slate-500 dark:text-slate-300 tracking-wider" weight="700">
                  Mật khẩu
                </Text>
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <View className={`h-12 flex-row items-center rounded-xl border bg-slate-55 dark:bg-slate-900/80 px-3.5 focus:border-[#f97316] ${errors.password ? 'border-red-500' : 'border-slate-200 dark:border-slate-800'}`}>
                      <LockKeyhole color={errors.password ? '#ef4444' : '#94a3b8'} size={18} strokeWidth={2} />
                      <TextInput
                        autoCapitalize="none"
                        className="ml-2.5 flex-1 text-[14px] text-slate-900 dark:text-white font-medium py-0"
                        editable={!isLoading}
                        onBlur={onBlur}
                        onChangeText={onChange}
                        placeholder="••••••••"
                        placeholderTextColor="#94a3b8"
                        secureTextEntry={!showPassword}
                        value={value}
                      />
                      <Pressable onPress={() => setShowPassword(!showPassword)}>
                        {showPassword ? (
                          <EyeOff color="#94a3b8" size={18} />
                        ) : (
                          <Eye color="#94a3b8" size={18} />
                        )}
                      </Pressable>
                    </View>
                  )}
                />
                {errors.password ? (
                  <Text className="mt-1.5 text-[12px] text-red-500" weight="600">
                    {errors.password.message}
                  </Text>
                ) : null}
              </View>

              {/* Xác nhận mật khẩu */}
              <View>
                <Text className="mb-2 text-[12px] uppercase text-slate-550 dark:text-slate-300 tracking-wider" weight="700">
                  Xác nhận mật khẩu
                </Text>
                <Controller
                  control={control}
                  name="confirmPassword"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <View className={`h-12 flex-row items-center rounded-xl border bg-slate-55 dark:bg-slate-900/80 px-3.5 focus:border-[#f97316] ${errors.confirmPassword ? 'border-red-500' : 'border-slate-200 dark:border-slate-800'}`}>
                      <LockKeyhole color={errors.confirmPassword ? '#ef4444' : '#94a3b8'} size={18} strokeWidth={2} />
                      <TextInput
                        autoCapitalize="none"
                        className="ml-2.5 flex-1 text-[14px] text-slate-900 dark:text-white font-medium py-0"
                        editable={!isLoading}
                        onBlur={onBlur}
                        onChangeText={onChange}
                        placeholder="••••••••"
                        placeholderTextColor="#94a3b8"
                        secureTextEntry={!showConfirmPassword}
                        value={value}
                      />
                      <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                        {showConfirmPassword ? (
                          <EyeOff color="#94a3b8" size={18} />
                        ) : (
                          <Eye color="#94a3b8" size={18} />
                        )}
                      </Pressable>
                    </View>
                  )}
                />
                {errors.confirmPassword ? (
                  <Text className="mt-1.5 text-[12px] text-red-500" weight="600">
                    {errors.confirmPassword.message}
                  </Text>
                ) : null}
              </View>

              {/* Điều khoản sử dụng */}
              <View>
                <Controller
                  control={control}
                  name="agreeToTerms"
                  render={({ field: { onChange, value } }) => (
                    <View className="flex-row items-start gap-2.5 select-none pt-1">
                      <Pressable
                        className={`mt-0.5 h-5 w-5 items-center justify-center rounded-md border ${value ? 'bg-[#f97316] border-[#f97316]' : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'}`}
                        onPress={() => onChange(!value)}
                      >
                        {value && <View className={`h-2 w-2 rounded-full ${colorScheme === 'dark' ? 'bg-white' : 'bg-slate-900'}`} />}
                      </Pressable>
                      <Text className="flex-1 text-[13px] text-slate-700 dark:text-slate-300 font-semibold leading-5">
                        Tôi đồng ý với{' '}
                        <Text className="text-[#f97316] font-bold">Điều khoản dịch vụ</Text> và{' '}
                        <Text className="text-[#f97316] font-bold">Chính sách bảo mật</Text> của RCField.
                      </Text>
                    </View>
                  )}
                />
                {errors.agreeToTerms ? (
                  <Text className="mt-1.5 text-[12px] text-red-500" weight="600">
                    {errors.agreeToTerms.message}
                  </Text>
                ) : null}
              </View>

              {/* Submit Button */}
              <Pressable
                accessibilityRole="button"
                className={`h-12 items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-950 border border-slate-800 dark:border-[#f97316]/20 shadow-md mt-2 ${!isValid || isLoading ? 'opacity-50' : 'active:bg-slate-850 dark:active:bg-slate-900'}`}
                disabled={!isValid || isLoading}
                onPress={handleSubmit(onSubmit)}
              >
                {isLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-[15px] text-white tracking-wide" weight="700">
                    Đăng Ký Thành Viên
                  </Text>
                )}
              </Pressable>

              {/* Link to Guest Mode */}
              <View className="flex-row justify-center mt-4">
                <Pressable onPress={() => router.replace('/(tabs)')} className="py-1.5 px-4 rounded-xl border border-dashed border-[#f97316]/30 active:bg-[#f97316]/5">
                  <Text className="text-[12.5px] text-[#f97316] font-bold">
                    Hoặc tiếp tục với tư cách khách
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
