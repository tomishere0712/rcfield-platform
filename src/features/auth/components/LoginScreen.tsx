import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react-native';
import { useState, useEffect } from 'react';
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
import * as SecureStore from 'expo-secure-store';
import Svg, { Path } from 'react-native-svg';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';


import { loginSchema, type LoginPayload } from '@/shared/schemas/auth';
import { useAuthStore } from '@/shared/store/auth-store';
import { Text } from '@/shared/ui/Text';
import { env } from '@/shared/config/env';

WebBrowser.maybeCompleteAuthSession();

const REMEMBERED_EMAIL_KEY = 'remembered_email';

export function LoginScreen() {
  const { colorScheme } = useColorScheme();
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const loginGoogle = useAuthStore((state) => state.loginGoogle);
  const isLoading = useAuthStore((state) => state.isLoading);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);



  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isValid },
  } = useForm<LoginPayload>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange', // Validate inline mỗi khi người dùng nhập dữ liệu
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // Tự động load email đã ghi nhớ
  useEffect(() => {
    async function loadRememberedEmail() {
      try {
        const savedEmail = await SecureStore.getItemAsync(REMEMBERED_EMAIL_KEY);
        if (savedEmail) {
          setValue('email', savedEmail, { shouldValidate: true });
          setRememberMe(true);
        }
      } catch (error) {
        console.log('Không thể lấy email đã lưu:', error);
      }
    }
    loadRememberedEmail();
  }, [setValue]);

  const onSubmit = async (data: LoginPayload) => {
    try {
      const normalizedEmail = data.email.trim().toLowerCase();
      if (rememberMe) {
        await SecureStore.setItemAsync(REMEMBERED_EMAIL_KEY, normalizedEmail);
      } else {
        await SecureStore.deleteItemAsync(REMEMBERED_EMAIL_KEY);
      }
      
      const user = await login({
        email: normalizedEmail,
        password: data.password,
      });
      
      // Kiểm tra role để redirect phù hợp với Mobile
      if (user.role === 'customer' || user.role === 'staff') {
        if (router.canDismiss()) {
          router.dismissAll();
        }
        router.replace('/(tabs)');
      } else {
        Alert.alert(
          'Truy cập bị từ chối',
          'Ứng dụng di động chỉ hỗ trợ Customer và Staff vận hành. Vui lòng đăng nhập trên website với vai trò của bạn.'
        );
        useAuthStore.getState().logout();
      }
    } catch (error: any) {
      let errMsg = 'Email hoặc mật khẩu không chính xác.';
      if (error?.response) {
        errMsg = error.response.data?.message || error.response.data?.error || errMsg;
      } else if (error?.request) {
        errMsg = 'Không thể kết nối đến máy chủ Backend. Vui lòng kiểm tra lại địa chỉ IP trong file .env và kết nối Wifi chung mạng với máy tính.';
      } else {
        errMsg = error.message || errMsg;
      }
      Alert.alert('Đăng nhập thất bại', errMsg);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      // 1. Tạo returnUrl động thích ứng với cả Expo Go và Standalone Build
      const returnUrl = Linking.createURL('expo-auth-session', {
        scheme: 'rcfieldmobile',
      });

      // 2. Tạo Google Auth URL trực tiếp
      const googleParams = new URLSearchParams({
        client_id: env.googleClientId,
        redirect_uri: 'https://auth.expo.io/@tomishere0712/rcfield-mobile',
        response_type: 'id_token',
        scope: 'openid profile email',
        nonce: 'rcfield_nonce',
        state: 'rcfield_state',
        prompt: 'select_account', // Ép buộc hiển thị màn hình chọn tài khoản Google
      });
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${googleParams.toString()}`;

      // 3. Tạo startUrl chuyển tiếp qua Expo Auth Proxy
      const proxyParams = new URLSearchParams({
        authUrl: googleAuthUrl,
        returnUrl: returnUrl,
      });
      const startUrl = `https://auth.expo.io/@tomishere0712/rcfield-mobile/start?${proxyParams.toString()}`;

      // 4. Mở trình duyệt xác thực hệ thống (Bypass disallowed_useragent)
      const result = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl);

      if (result.type === 'success' && result.url) {
        // 5. Giải mã deep link callback
        const parsed = Linking.parse(result.url);
        // ID Token có thể nằm trong query parameters hoặc fragment hash của callback url
        let idToken = parsed.queryParams?.id_token;
        if (!idToken) {
          const match = result.url.match(/id_token=([^&]+)/);
          if (match) {
            idToken = match[1];
          }
        }

        if (!idToken) {
          Alert.alert('Đăng nhập Google thất bại', 'Không lấy được thông tin ID Token từ Google.');
          return;
        }

        const tokenStr = Array.isArray(idToken) ? idToken[0] : idToken;

        // 6. Gửi token lên backend xác thực
        try {
          const user = await loginGoogle(tokenStr);
          if (user.role === 'customer' || user.role === 'staff') {
            if (router.canDismiss()) {
              router.dismissAll();
            }
            router.replace('/(tabs)');
          } else {
            Alert.alert(
              'Truy cập bị từ chối',
              `Tài khoản của bạn có vai trò là "${user.role.toUpperCase()}". Ứng dụng di động chỉ hỗ trợ Customer và Staff vận hành.`
            );
            useAuthStore.getState().logout();
          }
        } catch (error: any) {
          let errMsg = 'Không thể xác thực Google ID Token với Server.';
          if (error?.response) {
            errMsg = error.response.data?.message || error.response.data?.error || errMsg;
          } else if (error?.request) {
            errMsg = 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng của thiết bị di động.';
          } else {
            errMsg = error.message || errMsg;
          }
          Alert.alert('Đăng nhập Google thất bại', errMsg);
        }
      } else {
        // Cho phép dùng tài khoản test nếu huỷ/lỗi giống logic cũ
        Alert.alert(
          'Đăng nhập Google',
          'Quá trình đăng nhập đã bị hủy hoặc gặp sự cố. Bạn có muốn sử dụng tài khoản thử nghiệm thay thế?',
          [
            { text: 'Hủy', style: 'cancel' },
            {
              text: 'Dùng tài khoản Test',
              onPress: async () => {
                try {
                  const user = await login({ email: 'customer@gmail.com', password: '123456' });
                  if (user.role === 'customer' || user.role === 'staff') {
                    if (router.canDismiss()) {
                      router.dismissAll();
                    }
                    router.replace('/(tabs)');
                  }
                } catch {
                  Alert.alert('Lỗi', 'Không thể kết nối với tài khoản test.');
                }
              },
            },
          ]
        );
      }
    } catch {
      Alert.alert('Lỗi', 'Google Login gặp sự cố khi mở WebBrowser.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      {/* Background Glows (Hiệu ứng ánh sáng Cam & Indigo ở góc) */}
      <View className="absolute -top-20 -left-20 w-80 h-80 rounded-full bg-[#f97316]/10 blur-3xl pointer-events-none" />
      <View className="absolute bottom-10 -right-20 w-80 h-80 rounded-full bg-[#6366f1]/10 blur-3xl pointer-events-none" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Section */}
          <View className="mb-8">
            <View className="mb-4">
              <Image
                source={require('../../../../assets/images/rcfield-logo.png')}
                className="h-16 w-16 rounded-2xl"
                resizeMode="cover"
              />
            </View>
            <Text className="text-slate-900 dark:text-white text-3xl" variant="title" weight="700">
              Chào mừng quay lại
            </Text>
            <Text className="mt-2 text-[14px] leading-5 text-slate-500 dark:text-slate-400" weight="500">
              Đăng nhập để đặt sân đua và quản lý phiên chơi của bạn.
            </Text>
          </View>

          {/* Form Container */}
          <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-2xl">
            <View className="gap-5">
              {/* Input Email */}
              <View>
                <Text className="mb-2 text-[12px] uppercase text-slate-500 dark:text-slate-300 tracking-wider" weight="700">
                  Email
                </Text>
                <Controller
                  control={control}
                  name="email"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <View className={`h-12 flex-row items-center rounded-xl border bg-slate-50 dark:bg-slate-900/80 px-3.5 focus:border-[#f97316] ${errors.email ? 'border-red-500' : 'border-slate-200 dark:border-slate-800'}`}>
                      <Mail color={errors.email ? '#ef4444' : '#94a3b8'} size={18} strokeWidth={2} />
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
                {errors.email ? (
                  <Text className="mt-1.5 text-[12px] text-red-500" weight="600">
                    {errors.email.message}
                  </Text>
                ) : null}
              </View>

              {/* Input Password */}
              <View>
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-[12px] uppercase text-slate-500 dark:text-slate-300 tracking-wider" weight="700">
                    Mật khẩu
                  </Text>
                  <Pressable onPress={() => router.push('/(auth)/forgot-password')}>
                    <Text className="text-[12px] text-[#f97316]" weight="700">
                      Quên mật khẩu?
                    </Text>
                  </Pressable>
                </View>
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <View className={`h-12 flex-row items-center rounded-xl border bg-slate-50 dark:bg-slate-900/80 px-3.5 focus:border-[#f97316] ${errors.password ? 'border-red-500' : 'border-slate-200 dark:border-slate-800'}`}>
                      <LockKeyhole color={errors.password ? '#ef4444' : '#94a3b8'} size={18} strokeWidth={2} />
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

              {/* Remember Me Toggle */}
              <Pressable
                className="flex-row items-center gap-2.5"
                onPress={() => setRememberMe(!rememberMe)}
              >
                <View className={`h-5 w-5 items-center justify-center rounded-md border ${rememberMe ? 'bg-[#f97316] border-[#f97316]' : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'}`}>
                  {rememberMe && <View className={`h-2 w-2 rounded-full ${colorScheme === 'dark' ? 'bg-white' : 'bg-slate-900'}`} />}
                </View>
                <Text className="text-[13px] text-slate-700 dark:text-slate-300 font-semibold">
                  Ghi nhớ tài khoản trên thiết bị này
                </Text>
              </Pressable>

              {/* Submit Button */}
              <Pressable
                accessibilityRole="button"
                className={`h-12 items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-950 border border-slate-800 dark:border-[#f97316]/20 shadow-md ${!isValid || isLoading ? 'opacity-50' : 'active:bg-slate-850 dark:active:bg-slate-900'}`}
                disabled={!isValid || isLoading}
                onPress={handleSubmit(onSubmit)}
              >
                {isLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-[15px] text-white tracking-wide" weight="700">
                    Đăng Nhập
                  </Text>
                )}
              </Pressable>

              {/* Social Login Divider */}
              <View className="flex-row items-center my-2">
                <View className="flex-1 h-[1px] bg-slate-200 dark:bg-slate-800" />
                <Text className="mx-3 text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-widest">
                  Hoặc tiếp tục với
                </Text>
                <View className="flex-1 h-[1px] bg-slate-200 dark:bg-slate-800" />
              </View>

              {/* Google Button */}
              <Pressable
                className="h-12 flex-row items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/20 active:bg-slate-50 gap-2"
                onPress={handleGoogleLogin}
              >
                <Svg width={20} height={20} viewBox="0 0 24 24">
                  <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                  <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                </Svg>
                <Text className="text-[14px] text-slate-800 dark:text-white" weight="700">
                  Google
                </Text>
              </Pressable>

              {/* Link to Register */}
              <View className="flex-row justify-center mt-3 gap-1">
                <Text className="text-[13px] text-slate-500 dark:text-slate-400 font-semibold">
                  Chưa có tài khoản?
                </Text>
                <Pressable onPress={() => router.push('/(auth)/register')}>
                  <Text className="text-[13px] text-[#f97316] font-bold underline">
                    Đăng ký ngay
                  </Text>
                </Pressable>
              </View>

              {/* Link to Guest Mode */}
              <View className="flex-row justify-center mt-2">
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
