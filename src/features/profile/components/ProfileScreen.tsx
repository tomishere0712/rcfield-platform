import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  Mail,
  Phone,
  LockKeyhole,
  Eye,
  EyeOff,
  LogOut,
  Trash2,
  Bell,
  User,
  Save,
  Crown,
  Gem,
  Award,
  ShieldCheck,
  Heart,
  ChevronRight,
  CalendarDays,
  Trophy,
  MessageSquare,
} from 'lucide-react-native';
import { useEffect, useMemo, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import * as SecureStore from 'expo-secure-store';

import { getMe, updateMe, changePassword, uploadImage } from '@/features/auth/api/auth.api';
import { createScrollHandler, setTabBarVisibility, requestMainTab } from '@/shared/ui/main-tab-events';
import { getMyBookings } from '@/features/bookings/api/booking.api';
import { getCafeById } from '@/features/explore/api/explore.api';
import { NotificationBellButton } from '@/features/notifications/components/NotificationBellButton';
import { useAuthStore } from '@/shared/store/auth-store';
import { Text } from '@/shared/ui/Text';

export function ProfileScreen() {
  const router = useRouter();
  const { colorScheme, setColorScheme } = useColorScheme();
  const user = useAuthStore((state) => state.user);
  const role = useAuthStore((state) => state.role);
  const assignedCafeId = useAuthStore((state) => state.assignedCafeId);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const handleScroll = useRef(createScrollHandler()).current;

  useEffect(() => {
    setTabBarVisibility(true);
  }, []);

  // Hooks được gọi không điều kiện ở đây
  const [isDarkMode, setIsDarkMode] = useState(colorScheme === 'dark');

  useEffect(() => {
    setIsDarkMode(colorScheme === 'dark');
  }, [colorScheme]);

  const displayName = user?.fullName ?? user?.email ?? 'RCField User';
  const email = user?.email ?? 'user@rcfield.vn';
  const isCustomer = role === 'customer';

  const [bookingCount, setBookingCount] = useState(0);
  const [assignedCafeName, setAssignedCafeName] = useState('');
  const [assignedCafeAddress, setAssignedCafeAddress] = useState('');
  const [loadingAssignedCafe, setLoadingAssignedCafe] = useState(false);

  useEffect(() => {
    if (!isCustomer) {
      setBookingCount(0);
      return;
    }

    getMyBookings({ limit: 1 })
      .then((res) => {
        setBookingCount(res.total);
      })
      .catch((err) => {
        console.error('Error fetching bookings total for profile stats:', err);
      });
  }, [isCustomer]);

  useEffect(() => {
    if (isCustomer || !assignedCafeId) {
      setAssignedCafeName('');
      setAssignedCafeAddress('');
      setLoadingAssignedCafe(false);
      return;
    }

    let mounted = true;
    setLoadingAssignedCafe(true);
    getCafeById(assignedCafeId)
      .then((cafe) => {
        if (!mounted) return;
        setAssignedCafeName(cafe?.name ?? '');
        setAssignedCafeAddress(cafe?.address ?? '');
      })
      .catch((err) => {
        console.error('Error fetching assigned cafe detail:', err);
      })
      .finally(() => {
        if (mounted) {
          setLoadingAssignedCafe(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [assignedCafeId, isCustomer]);

  const { points, memberTier, pointsToNextTier, progress, tierColor, tierBg, nextTierLabel } = useMemo(() => {
    const pts = bookingCount * 500;
    let tier = 'Standard Member';
    let nextTier = 'Bronze';
    let ptsToNext = 1500 - pts;
    let prog = pts / 1500;
    let color = '#94a3b8'; // slate-400
    let bg = 'bg-slate-500/10 border-slate-500/20';

    if (pts >= 25000) {
      tier = 'Platinum Member';
      nextTier = '';
      ptsToNext = 0;
      prog = 1.0;
      color = '#38bdf8'; // sky-400
      bg = 'bg-sky-500/10 border-sky-500/20';
    } else if (pts >= 10000) {
      tier = 'Gold Member';
      nextTier = 'Platinum';
      ptsToNext = 25000 - pts;
      prog = (pts - 10000) / 15000;
      color = '#eab308'; // yellow-500
      bg = 'bg-yellow-500/10 border-yellow-500/20';
    } else if (pts >= 5000) {
      tier = 'Silver Member';
      nextTier = 'Gold';
      ptsToNext = 10000 - pts;
      prog = (pts - 5000) / 5000;
      color = '#cbd5e1'; // slate-300
      bg = 'bg-slate-300/10 border-slate-300/20';
    } else if (pts >= 1500) {
      tier = 'Bronze Member';
      nextTier = 'Silver';
      ptsToNext = 5000 - pts;
      prog = (pts - 1500) / 3500;
      color = '#b45309'; // amber-700
      bg = 'bg-amber-700/10 border-amber-700/20';
    }

    return {
      points: pts,
      memberTier: tier,
      pointsToNextTier: ptsToNext,
      progress: Math.min(100, Math.max(0, prog * 100)),
      tierColor: color,
      tierBg: bg,
      nextTierLabel: nextTier,
    };
  }, [bookingCount]);

  const [firstName, lastName] = useMemo(() => splitName(displayName), [displayName]);

  // States cho Form Thông tin cá nhân
  const [form, setForm] = useState({
    firstName: firstName,
    lastName: lastName,
    email: email,
    phone: user?.phone ?? '',
    avatarUrl: user?.avatarUrl ?? '',
  });

  // Cập nhật lại form state khi user store thay đổi
  useEffect(() => {
    setForm({
      firstName,
      lastName,
      email,
      phone: user?.phone ?? '',
      avatarUrl: user?.avatarUrl ?? '',
    });
  }, [email, firstName, lastName, user?.avatarUrl, user?.phone]);

  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // States cho Form Đổi mật khẩu
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });
  const [passwordErrors, setPasswordErrors] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  // Hàm validate form đổi mật khẩu inline
  const validatePasswordForm = () => {
    const errors = {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    };
    let isValid = true;

    if (!passwordForm.currentPassword) {
      errors.currentPassword = 'Vui lòng nhập mật khẩu hiện tại.';
      isValid = false;
    }

    if (!passwordForm.newPassword) {
      errors.newPassword = 'Vui lòng nhập mật khẩu mới.';
      isValid = false;
    } else if (passwordForm.newPassword.length < 6) {
      errors.newPassword = 'Mật khẩu mới phải từ 6 ký tự trở lên.';
      isValid = false;
    }

    if (!passwordForm.confirmNewPassword) {
      errors.confirmNewPassword = 'Vui lòng xác nhận mật khẩu mới.';
      isValid = false;
    } else if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      errors.confirmNewPassword = 'Mật khẩu mới nhập lại không trùng khớp.';
      isValid = false;
    }

    setPasswordErrors(errors);
    return isValid;
  };

  // States cho Cài đặt thông báo (Mô phỏng lưu trữ local)
  const [emailMarketing, setEmailMarketing] = useState(true);
  const [smsReminder, setSmsReminder] = useState(true);

  // Tự động đồng bộ profile từ server khi load màn hình
  useEffect(() => {
    if (!isAuthenticated) return;
    let mounted = true;
    getMe()
      .then((profile) => {
        if (!mounted) return;
        setUser(profile);
      })
      .catch((err) => {
        console.error('Error fetching profile detail:', err);
      });

    return () => {
      mounted = false;
    };
  }, [setUser, isAuthenticated]);

  // Hàm lưu thông tin cá nhân
  const handleSaveProfile = async (nextAvatarUrl = form.avatarUrl) => {
    if (!form.firstName.trim()) {
      Alert.alert('Lỗi', 'Họ không được để trống.');
      return;
    }
    if (!form.lastName.trim()) {
      Alert.alert('Lỗi', 'Tên không được để trống.');
      return;
    }
    
    // Validate phone number cơ bản của Việt Nam
    if (form.phone.trim()) {
      const phoneRegex = /^(03|05|07|08|09|84[3|5|7|8|9])([0-9]{8})$/;
      if (!phoneRegex.test(form.phone.trim())) {
        Alert.alert('Lỗi', 'Số điện thoại không đúng định dạng Việt Nam.');
        return;
      }
    }

    setSavingProfile(true);
    try {
      const updatedUser = await updateMe({
        fullName: `${form.firstName.trim()} ${form.lastName.trim()}`,
        phone: form.phone.trim() || null,
        avatarUrl: nextAvatarUrl || null,
      });
      setUser(updatedUser);
      Alert.alert('Thành công', 'Đã cập nhật thông tin hồ sơ.');
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || 'Không thể lưu thay đổi. Vui lòng thử lại.';
      Alert.alert('Lỗi', errMsg);
    } finally {
      setSavingProfile(false);
    }
  };

  // Hàm chọn và upload avatar
  const handleSelectAvatar = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Quyền truy cập', 'Vui lòng cấp quyền truy cập thư viện ảnh để đổi ảnh đại diện.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (pickerResult.canceled || !pickerResult.assets?.[0]?.uri) {
        return;
      }

      setUploadingAvatar(true);
      const imageUri = pickerResult.assets[0].uri;
      
      // Upload lên cloud
      const uploadRes = await uploadImage(imageUri, 'profile-avatar');
      
      // Cập nhật URL avatar mới trong form
      setForm((prev) => ({ ...prev, avatarUrl: uploadRes.url }));
      
      // Lưu trực tiếp
      await handleSaveProfile(uploadRes.url);
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || 'Không thể tải ảnh đại diện lên.';
      Alert.alert('Lỗi upload', errMsg);
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Hàm xóa ảnh đại diện
  const handleRemoveAvatar = async () => {
    setForm((prev) => ({ ...prev, avatarUrl: '' }));
    await handleSaveProfile('');
  };

  // Hàm đổi mật khẩu
  const handleChangePassword = async () => {
    if (!validatePasswordForm()) {
      return;
    }

    setChangingPw(true);
    try {
      await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      
      // Reset form sau khi thành công
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      });
      setPasswordErrors({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      });

      Alert.alert(
        'Thành công',
        'Đổi mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới.',
        [
          {
            text: 'OK',
            onPress: async () => {
              await logout();
              if (router.canDismiss()) {
                router.dismissAll();
              }
              router.replace('/(auth)/login');
            },
          },
        ]
      );
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || 'Đổi mật khẩu thất bại. Vui lòng kiểm tra lại mật khẩu hiện tại.';
      // Nếu là lỗi từ server liên quan đến mật khẩu cũ, hiển thị ở input mật khẩu hiện tại
      setPasswordErrors((prev) => ({
        ...prev,
        currentPassword: errMsg,
      }));
    } finally {
      setChangingPw(false);
    }
  };

  // Đăng xuất tài khoản
  const handleLogout = () => {
    Alert.alert(
      'Đăng xuất',
      'Bạn có chắc chắn muốn đăng xuất khỏi tài khoản?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đăng xuất',
          style: 'destructive',
          onPress: async () => {
            await logout();
            if (router.canDismiss()) {
              router.dismissAll();
            }
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  // Xóa tài khoản
  const handleDeleteAccount = () => {
    Alert.alert(
      'Xóa tài khoản',
      'Tính năng xóa tài khoản đang được phát triển. Vui lòng gửi email đến support@rcfield.vn để yêu cầu xóa dữ liệu.',
      [{ text: 'OK' }]
    );
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19] justify-center items-center px-8" edges={['top', 'left', 'right']}>
        {/* Background Glows */}
        <View className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-[#f97316]/5 blur-3xl pointer-events-none" />
        <View className="absolute bottom-10 -left-20 w-80 h-80 rounded-full bg-[#6366f1]/5 blur-3xl pointer-events-none" />

        <View className="size-16 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 justify-center items-center mb-4">
          <User color="#f97316" size={28} />
        </View>
        <Text className="text-slate-900 dark:text-white text-lg font-bold text-center">
          Yêu cầu đăng nhập
        </Text>
        <Text className="mt-2 text-slate-500 dark:text-slate-400 text-sm text-center leading-5 font-semibold max-w-xs mb-6">
          Vui lòng đăng nhập tài khoản của bạn để xem và quản lý thông tin hồ sơ cá nhân.
        </Text>
        <Pressable
          className="w-full h-11 items-center justify-center rounded-xl bg-[#ea580c] active:bg-[#f97316] shadow-md mb-4"
          onPress={() => router.push('/(auth)/login')}
        >
          <Text className="text-white text-sm font-bold">Đăng nhập ngay</Text>
        </Pressable>

        {/* Nút chuyển đổi Theme nhanh cho Guest */}
        <View className="flex-row items-center gap-3 mt-6">
          <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold">Giao diện:</Text>
          <Pressable
            onPress={async () => {
              const nextTheme = colorScheme === 'dark' ? 'light' : 'dark';
              setColorScheme(nextTheme);
              await SecureStore.setItemAsync('rcfield_theme', nextTheme);
            }}
            className="px-3.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 active:bg-slate-300 dark:active:bg-slate-700"
          >
            <Text className="text-slate-800 dark:text-slate-200 text-xs font-bold">
              {colorScheme === 'dark' ? 'Chế độ Sáng' : 'Chế độ Tối'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-grow flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      {/* Background Glows (Hiển thị mờ ở light mode và rõ ở dark mode) */}
      <View className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-[#f97316]/5 dark:bg-[#f97316]/10 blur-3xl pointer-events-none" />
      <View className="absolute bottom-10 -left-20 w-80 h-80 rounded-full bg-[#6366f1]/5 dark:bg-[#6366f1]/10 blur-3xl pointer-events-none" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-grow flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow px-5 py-6 pb-12"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {/* Header Màn hình */}
          <View className="mb-6 flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-slate-900 dark:text-white text-3xl" variant="title" weight="700">
                Hồ sơ cá nhân
              </Text>
              <Text className="mt-1.5 text-[14px] leading-5 text-slate-500 dark:text-slate-400 font-semibold">
                {isCustomer
                  ? 'Quản lý thông tin tài khoản, bảo mật và tuỳ chọn cá nhân.'
                  : 'Quản lý thông tin tài khoản và bảo mật trực ca của bạn.'}
              </Text>
            </View>

            <NotificationBellButton />
          </View>

          {/* Section: Avatar */}
          <View className="items-center mb-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-6 shadow-2xl">
            <Pressable
              className="relative group size-24 rounded-full border-2 border-slate-350 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-900 justify-center items-center"
              onPress={handleSelectAvatar}
              disabled={uploadingAvatar}
            >
              {uploadingAvatar ? (
                <ActivityIndicator color="#f97316" size="small" />
              ) : form.avatarUrl ? (
                <Image
                  source={{ uri: form.avatarUrl }}
                  className="size-full rounded-full object-cover"
                />
              ) : (
                <Text className="text-3xl font-bold text-[#f97316]">
                  {getInitials(displayName)}
                </Text>
              )}
              
              <View className="absolute bottom-0 right-0 left-0 bg-black/40 py-1 items-center">
                <Camera color="#ffffff" size={14} />
              </View>
            </Pressable>

            <View className="flex-row gap-3 mt-4">
              <Pressable
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 active:bg-slate-200 dark:active:bg-slate-800"
                onPress={handleSelectAvatar}
                disabled={uploadingAvatar || savingProfile}
              >
                <Text className="text-[13px] text-slate-800 dark:text-slate-200 font-bold">
                  Tải ảnh mới
                </Text>
              </Pressable>
              
              {form.avatarUrl ? (
                <Pressable
                  className="px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 active:bg-red-100 dark:active:bg-red-950/40"
                  onPress={handleRemoveAvatar}
                  disabled={uploadingAvatar || savingProfile}
                >
                  <Text className="text-[13px] text-red-500 dark:text-red-400 font-bold">
                    Xóa ảnh
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Text className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 text-center leading-4 font-medium">
              Khuyên dùng ảnh định dạng JPG, PNG hoặc WEBP.{'\n'}Kích thước tối đa 5MB.
            </Text>
          </View>

          {isCustomer ? (
            /* Section: Hạng thành viên & Điểm tin cậy (Premium Loyaty Card) */
            <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-2xl mb-6 relative overflow-hidden">
              {/* Thanh màu phản quang theo hạng */}
              <View className="absolute top-0 right-0 left-0 h-[3px]" style={{ backgroundColor: tierColor }} />

              <View className="flex-row items-center justify-between mb-3.5">
                <Text className="text-[12px] font-bold text-slate-800 dark:text-white uppercase tracking-wider">
                  Hạng thành viên
                </Text>
                <View className={`px-2.5 py-0.5 rounded-full border ${tierBg}`}>
                  <Text className="text-[9px] font-black uppercase tracking-wide" style={{ color: tierColor }}>
                    {memberTier}
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center gap-4 mb-4">
                <View className="size-12 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 justify-center items-center shadow-lg">
                  {memberTier.includes('Gold') ? (
                    <Crown color={tierColor} size={22} />
                  ) : memberTier.includes('Platinum') ? (
                    <Gem color={tierColor} size={22} />
                  ) : memberTier.includes('Silver') ? (
                    <ShieldCheck color={tierColor} size={22} />
                  ) : (
                    <Award color={tierColor} size={22} />
                  )}
                </View>
                <View className="flex-1">
                  <View className="flex-row items-baseline gap-1">
                    <Text className="text-xl font-extrabold" style={{ color: tierColor }}>
                      {points.toLocaleString('vi-VN')}
                    </Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold">
                      điểm
                    </Text>
                  </View>
                  <Text className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                    Tích lũy từ {bookingCount} lượt chơi đã đặt
                  </Text>
                </View>
              </View>

              {/* Thanh tiến trình thăng hạng */}
              {pointsToNextTier > 0 ? (
                <View className="space-y-1.5">
                  <View className="flex-row justify-between text-[10.5px] font-bold">
                    <Text className="text-slate-500 dark:text-slate-400">Tiến trình lên {nextTierLabel}</Text>
                    <Text style={{ color: tierColor }}>Còn {pointsToNextTier.toLocaleString('vi-VN')} điểm</Text>
                  </View>
                  <View className="h-2 w-full bg-slate-100 dark:bg-slate-950 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800">
                    <View
                      className="h-full rounded-full"
                      style={{ width: `${progress}%`, backgroundColor: tierColor }}
                    />
                  </View>
                </View>
              ) : (
                <View className="rounded-lg bg-sky-500/5 border border-sky-500/10 py-2 items-center">
                  <Text className="text-[10px] text-sky-400 font-black tracking-wide uppercase">
                    🏆 Bạn đã đạt hạng thành viên cao nhất!
                  </Text>
                </View>
              )}

              {/* Điểm uy tín (Trust Score) */}
              <View className="w-full h-[1px] bg-slate-200 dark:bg-slate-800/80 my-4" />
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-[13px] font-bold text-slate-900 dark:text-white">Điểm uy tín (Trust Score)</Text>
                  <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold leading-4 mt-0.5">
                    Quyết định quyền hạn đặt lịch chơi và hoàn tiền của bạn.
                  </Text>
                </View>
                <View className="flex-row items-baseline gap-0.5">
                  <Text className="text-lg font-black text-emerald-500">
                    {user?.trustScore ?? 100}
                  </Text>
                  <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold">/100</Text>
                </View>
              </View>
            </View>
          ) : (
            <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-2xl mb-6">
              <View className="mb-4 flex-row items-center justify-between">
                <View>
                  <Text className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Vai trò tài khoản
                  </Text>
                  <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Hồ sơ vận hành dùng cho ứng dụng nhân viên.
                  </Text>
                </View>
                <View className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1">
                  <Text className="text-[10px] uppercase text-emerald-400" weight="700">
                    {role === 'staff' ? 'Nhân viên' : 'Khách hàng'}
                  </Text>
                </View>
              </View>

              <View className="gap-3">
                <View className="rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-950/60 p-3">
                  <Text className="text-[11px] uppercase text-slate-450 dark:text-slate-500" weight="700">
                    Chi nhánh được phân công
                  </Text>
                  <Text className="mt-1 text-[13px] text-slate-900 dark:text-white" weight="700">
                    {assignedCafeId
                      ? assignedCafeName ||
                        (loadingAssignedCafe
                          ? `Đang tải tên chi nhánh #${assignedCafeId.slice(0, 8).toUpperCase()}`
                          : `Không tải được tên chi nhánh #${assignedCafeId.slice(0, 8).toUpperCase()}`)
                      : 'Chưa được phân công chi nhánh'}
                  </Text>
                  {assignedCafeAddress ? (
                    <Text className="mt-1 text-[11px] leading-4 text-slate-500">
                      {assignedCafeAddress}
                    </Text>
                  ) : null}
                </View>
                <View className="rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-950/60 p-3">
                  <Text className="text-[11px] uppercase text-slate-450 dark:text-slate-500" weight="700">
                    Quyền thao tác
                  </Text>
                  <Text className="mt-1 text-[12px] leading-5 text-slate-700 dark:text-slate-300">
                    Nhận xe theo lịch hôm nay, cập nhật đơn đồ ăn, thức uống và xem chi tiết phiên chạy.
                  </Text>
                </View>
              </View>
            </View>
          )}

          {isCustomer && (
            /* Section: Hoạt động & Dịch vụ (Lịch chơi, Giải đấu, Hội viên & Cơ sở yêu thích) */
            <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-2xl mb-6">
              <View className="flex-row items-center mb-4 gap-2 border-b border-slate-200 dark:border-slate-800/80 pb-2">
                <Trophy color="#f97316" size={16} />
                <Text className="text-[15px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Hoạt động & Dịch vụ
                </Text>
              </View>

              <View className="gap-3">
                {/* Lịch chơi của tôi */}
                <Pressable
                  onPress={() => {
                    requestMainTab(2);
                  }}
                  className="flex-row items-center justify-between p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/45 bg-slate-50/50 dark:bg-slate-900/40 active:bg-slate-100 dark:active:bg-slate-900 gap-2"
                >
                  <View className="flex-row items-center gap-3 flex-1 min-w-0">
                    <View className="size-8 shrink-0 rounded-lg bg-orange-50 dark:bg-orange-950/20 items-center justify-center">
                      <CalendarDays color="#ea580c" size={16} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-xs font-bold text-slate-800 dark:text-slate-200" numberOfLines={1}>Lịch chơi của tôi</Text>
                      <Text className="text-[10px] font-semibold text-slate-400 mt-0.5" numberOfLines={1}>Quản lý lịch đặt và quét mã check-in vào sân</Text>
                    </View>
                  </View>
                  <ChevronRight color="#94a3b8" size={16} className="shrink-0" />
                </Pressable>

                {/* Giải đấu đã tham gia */}
                <Pressable
                  onPress={() => {
                    router.push('/customer/my-contests' as any);
                  }}
                  className="flex-row items-center justify-between p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/45 bg-slate-50/50 dark:bg-slate-900/40 active:bg-slate-100 dark:active:bg-slate-900 gap-2"
                >
                  <View className="flex-row items-center gap-3 flex-1 min-w-0">
                    <View className="size-8 shrink-0 rounded-lg bg-orange-50 dark:bg-orange-950/20 items-center justify-center">
                      <Trophy color="#ea580c" size={16} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-xs font-bold text-slate-800 dark:text-slate-200" numberOfLines={1}>Giải đấu đã tham gia</Text>
                      <Text className="text-[10px] font-semibold text-slate-400 mt-0.5" numberOfLines={1}>Theo dõi lịch thi đấu, vé QR giải và kết quả đấu</Text>
                    </View>
                  </View>
                  <ChevronRight color="#94a3b8" size={16} className="shrink-0" />
                </Pressable>

                {/* Gói hội viên của tôi */}
                <Pressable
                  onPress={() => router.push('/customer/packages' as any)}
                  className="flex-row items-center justify-between p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/45 bg-slate-50/50 dark:bg-slate-900/40 active:bg-slate-100 dark:active:bg-slate-900 gap-2"
                >
                  <View className="flex-row items-center gap-3 flex-1 min-w-0">
                    <View className="size-8 shrink-0 rounded-lg bg-purple-50 dark:bg-purple-950/20 items-center justify-center">
                      <Gem color="#a855f7" size={16} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-xs font-bold text-slate-800 dark:text-slate-200" numberOfLines={1}>Gói hội viên của tôi</Text>
                      <Text className="text-[10px] font-semibold text-slate-400 mt-0.5" numberOfLines={1}>Xem thông tin gói hội viên và đặc quyền tích lũy</Text>
                    </View>
                  </View>
                  <ChevronRight color="#94a3b8" size={16} className="shrink-0" />
                </Pressable>

                {/* Cơ sở yêu thích */}
                <Pressable
                  onPress={() => router.push('/favorites')}
                  className="flex-row items-center justify-between p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/45 bg-slate-50/50 dark:bg-slate-900/40 active:bg-slate-100 dark:active:bg-slate-900 gap-2"
                >
                  <View className="flex-row items-center gap-3 flex-1 min-w-0">
                    <View className="size-8 shrink-0 rounded-lg bg-red-50 dark:bg-red-950/20 items-center justify-center">
                      <Heart color="#ef4444" size={16} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-xs font-bold text-slate-800 dark:text-slate-200" numberOfLines={1}>Cơ sở yêu thích</Text>
                      <Text className="text-[10px] font-semibold text-slate-400 mt-0.5" numberOfLines={1}>Các chi nhánh RC Field bạn thường xuyên ghé chơi</Text>
                    </View>
                  </View>
                  <ChevronRight color="#94a3b8" size={16} className="shrink-0" />
                </Pressable>

                {/* Đánh giá của tôi */}
                <Pressable
                  onPress={() => router.push('/customer/my-reviews' as any)}
                  className="flex-row items-center justify-between p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/45 bg-slate-50/50 dark:bg-slate-900/40 active:bg-slate-100 dark:active:bg-slate-900 gap-2"
                >
                  <View className="flex-row items-center gap-3 flex-1 min-w-0">
                    <View className="size-8 shrink-0 rounded-lg bg-amber-50 dark:bg-amber-950/20 items-center justify-center">
                      <MessageSquare color="#d97706" size={16} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-xs font-bold text-slate-800 dark:text-slate-200" numberOfLines={1}>Đánh giá của tôi</Text>
                      <Text className="text-[10px] font-semibold text-slate-400 mt-0.5" numberOfLines={1}>Xem các đánh giá và phản hồi dịch vụ của bạn</Text>
                    </View>
                  </View>
                  <ChevronRight color="#94a3b8" size={16} className="shrink-0" />
                </Pressable>
              </View>
            </View>
          )}

          {/* Section: Thông tin cơ bản */}
          <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-2xl mb-6">
            <View className="flex-row items-center mb-4 gap-2 border-b border-slate-200 dark:border-slate-800/80 pb-2">
              <User color="#f97316" size={18} />
              <Text className="text-[15px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Thông tin cơ bản
              </Text>
            </View>

            <View className="gap-4">
              {/* Họ */}
              <View>
                <Text className="mb-1.5 text-[11px] uppercase text-slate-550 dark:text-slate-400 tracking-wider font-bold">
                  Họ
                </Text>
                <View className="h-11 flex-row items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 px-3.5 focus:border-[#f97316]">
                  <TextInput
                    className="flex-1 text-[14px] text-slate-900 dark:text-white font-medium"
                    editable={!savingProfile}
                    onChangeText={(val) => setForm((prev) => ({ ...prev, firstName: val }))}
                    placeholder="Nguyễn"
                    placeholderTextColor="#94a3b8"
                    value={form.firstName}
                  />
                </View>
              </View>

              {/* Tên */}
              <View>
                <Text className="mb-1.5 text-[11px] uppercase text-slate-550 dark:text-slate-400 tracking-wider font-bold">
                  Tên
                </Text>
                <View className="h-11 flex-row items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 px-3.5 focus:border-[#f97316]">
                  <TextInput
                    className="flex-1 text-[14px] text-slate-900 dark:text-white font-medium"
                    editable={!savingProfile}
                    onChangeText={(val) => setForm((prev) => ({ ...prev, lastName: val }))}
                    placeholder="Văn A"
                    placeholderTextColor="#94a3b8"
                    value={form.lastName}
                  />
                </View>
              </View>

              {/* Email */}
              <View>
                <Text className="mb-1.5 text-[11px] uppercase text-slate-550 dark:text-slate-400 tracking-wider font-bold">
                  Email Address
                </Text>
                <View className="h-11 flex-row items-center rounded-xl border border-slate-150 dark:border-slate-800/50 bg-[#e2e8f0]/40 dark:bg-slate-950/80 px-3.5 opacity-60">
                  <Mail color="#94a3b8" size={16} />
                  <TextInput
                    className="ml-2.5 flex-1 text-[14px] text-slate-500 dark:text-slate-400 font-medium"
                    editable={false}
                    value={form.email}
                  />
                </View>
              </View>

              {/* Số điện thoại */}
              <View>
                <Text className="mb-1.5 text-[11px] uppercase text-slate-550 dark:text-slate-400 tracking-wider font-bold">
                  Số điện thoại
                </Text>
                <View className="h-11 flex-row items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 px-3.5 focus:border-[#f97316]">
                  <Phone color="#94a3b8" size={16} />
                  <TextInput
                    className="ml-2.5 flex-1 text-[14px] text-slate-900 dark:text-white font-medium"
                    editable={!savingProfile}
                    keyboardType="phone-pad"
                    onChangeText={(val) => setForm((prev) => ({ ...prev, phone: val }))}
                    placeholder="0987654321"
                    placeholderTextColor="#94a3b8"
                    value={form.phone}
                  />
                </View>
              </View>

              {/* Button Save */}
              <Pressable
                className={`h-11 flex-row items-center justify-center rounded-xl bg-[#ea580c] active:bg-[#f97316] gap-2 mt-2 ${savingProfile ? 'opacity-70' : ''}`}
                disabled={savingProfile}
                onPress={() => handleSaveProfile()}
              >
                {savingProfile ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Save color="#ffffff" size={16} />
                    <Text className="text-[14px] text-white font-bold">
                      Lưu thay đổi
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>

          {isCustomer ? (
            /* Section: Cài đặt thông báo */
            <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-2xl mb-6">
              <View className="flex-row items-center mb-4 gap-2 border-b border-slate-200 dark:border-slate-800/80 pb-2">
                <Bell color="#f97316" size={18} />
                <Text className="text-[15px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Cài đặt nhận thông báo
                </Text>
              </View>

              <View className="gap-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-4">
                    <Text className="text-[14px] font-semibold text-slate-900 dark:text-white">
                      Email Marketing
                    </Text>
                    <Text className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-4 mt-0.5">
                      Nhận thông tin tin tức khuyến mãi, giải đua và các sự kiện hấp dẫn từ hệ thống.
                    </Text>
                  </View>
                  <Switch
                    value={emailMarketing}
                    onValueChange={setEmailMarketing}
                    trackColor={{ false: '#cbd5e1', true: '#ea580c' }}
                    thumbColor="#ffffff"
                  />
                </View>

                <View className="w-full h-[1px] bg-slate-200 dark:bg-slate-800/80" />

                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-4">
                    <Text className="text-[14px] font-semibold text-slate-900 dark:text-white">
                      SMS Booking Reminders
                    </Text>
                    <Text className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-4 mt-0.5">
                      Tự động nhận tin nhắn SMS nhắc nhở lịch đặt sân 1 tiếng trước khi bắt đầu.
                    </Text>
                  </View>
                  <Switch
                    value={smsReminder}
                    onValueChange={setSmsReminder}
                    trackColor={{ false: '#cbd5e1', true: '#ea580c' }}
                    thumbColor="#ffffff"
                  />
                </View>
              </View>
            </View>
          ) : null}

          {/* Section: Cài đặt hệ thống (Giao diện) */}
          <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-2xl mb-6">
            <View className="flex-row items-center mb-4 gap-2 border-b border-slate-200 dark:border-slate-800/80 pb-2">
              <Bell color="#f97316" size={18} />
              <Text className="text-[15px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Cài đặt giao diện
              </Text>
            </View>

            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-4">
                <Text className="text-[14px] font-semibold text-slate-900 dark:text-white">
                  Chế độ tối (Dark Mode)
                </Text>
                <Text className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-4 mt-0.5">
                  Chuyển đổi giao diện ứng dụng sang tông màu tối để bảo vệ mắt.
                </Text>
              </View>
              <Switch
                value={isDarkMode}
                onValueChange={(val) => {
                  setIsDarkMode(val);
                  setTimeout(async () => {
                    const nextTheme = val ? 'dark' : 'light';
                    setColorScheme(nextTheme);
                    await SecureStore.setItemAsync('rcfield_theme', nextTheme);
                  }, 100);
                }}
                trackColor={{ false: '#cbd5e1', true: '#ea580c' }}
                thumbColor="#ffffff"
              />
            </View>
          </View>

          {/* Section: Đổi mật khẩu */}
          <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-2xl mb-6">
            <View className="flex-row items-center mb-4 gap-2 border-b border-slate-200 dark:border-slate-800/80 pb-2">
              <LockKeyhole color="#f97316" size={18} />
              <Text className="text-[15px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Đổi mật khẩu
              </Text>
            </View>

            <View className="gap-4">
              {/* Mật khẩu hiện tại */}
              <View>
                <Text className="mb-1.5 text-[11px] uppercase text-slate-550 dark:text-slate-400 tracking-wider font-bold">
                  Mật khẩu hiện tại
                </Text>
                <View className={`h-11 flex-row items-center rounded-xl border bg-slate-50 dark:bg-slate-900/80 px-3.5 focus:border-[#f97316] ${passwordErrors.currentPassword ? 'border-red-500' : 'border-slate-200 dark:border-slate-800'}`}>
                  <TextInput
                    autoCapitalize="none"
                    className="flex-1 text-[14px] text-slate-900 dark:text-white font-medium py-0"
                    editable={!changingPw}
                    onChangeText={(val) => {
                      setPasswordForm((prev) => ({ ...prev, currentPassword: val }));
                      if (passwordErrors.currentPassword) {
                        setPasswordErrors((prev) => ({ ...prev, currentPassword: '' }));
                      }
                    }}
                    placeholder="••••••••"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={!showCurrentPassword}
                    value={passwordForm.currentPassword}
                  />
                  <Pressable onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
                    {showCurrentPassword ? (
                      <EyeOff color={passwordErrors.currentPassword ? '#ef4444' : '#94a3b8'} size={16} />
                    ) : (
                      <Eye color={passwordErrors.currentPassword ? '#ef4444' : '#94a3b8'} size={16} />
                    )}
                  </Pressable>
                </View>
                {passwordErrors.currentPassword ? (
                  <Text className="mt-1.5 text-[11.5px] text-red-500 font-semibold">
                    {passwordErrors.currentPassword}
                  </Text>
                ) : null}
              </View>

              {/* Mật khẩu mới */}
              <View>
                <Text className="mb-1.5 text-[11px] uppercase text-slate-550 dark:text-slate-400 tracking-wider font-bold">
                  Mật khẩu mới
                </Text>
                <View className={`h-11 flex-row items-center rounded-xl border bg-slate-50 dark:bg-slate-900/80 px-3.5 focus:border-[#f97316] ${passwordErrors.newPassword ? 'border-red-500' : 'border-slate-200 dark:border-slate-800'}`}>
                  <TextInput
                    autoCapitalize="none"
                    className="flex-1 text-[14px] text-slate-900 dark:text-white font-medium py-0"
                    editable={!changingPw}
                    onChangeText={(val) => {
                      setPasswordForm((prev) => ({ ...prev, newPassword: val }));
                      if (passwordErrors.newPassword) {
                        setPasswordErrors((prev) => ({ ...prev, newPassword: '' }));
                      }
                    }}
                    placeholder="••••••••"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={!showNewPassword}
                    value={passwordForm.newPassword}
                  />
                  <Pressable onPress={() => setShowNewPassword(!showNewPassword)}>
                    {showNewPassword ? (
                      <EyeOff color={passwordErrors.newPassword ? '#ef4444' : '#94a3b8'} size={16} />
                    ) : (
                      <Eye color={passwordErrors.newPassword ? '#ef4444' : '#94a3b8'} size={16} />
                    )}
                  </Pressable>
                </View>
                {passwordErrors.newPassword ? (
                  <Text className="mt-1.5 text-[11.5px] text-red-500 font-semibold">
                    {passwordErrors.newPassword}
                  </Text>
                ) : null}
              </View>

              {/* Nhập lại mật khẩu mới */}
              <View>
                <Text className="mb-1.5 text-[11px] uppercase text-slate-550 dark:text-slate-400 tracking-wider font-bold">
                  Nhập lại mật khẩu mới
                </Text>
                <View className={`h-11 flex-row items-center rounded-xl border bg-slate-50 dark:bg-slate-900/80 px-3.5 focus:border-[#f97316] ${passwordErrors.confirmNewPassword ? 'border-red-500' : 'border-slate-200 dark:border-slate-800'}`}>
                  <TextInput
                    autoCapitalize="none"
                    className="flex-1 text-[14px] text-slate-900 dark:text-white font-medium py-0"
                    editable={!changingPw}
                    onChangeText={(val) => {
                      setPasswordForm((prev) => ({ ...prev, confirmNewPassword: val }));
                      if (passwordErrors.confirmNewPassword) {
                        setPasswordErrors((prev) => ({ ...prev, confirmNewPassword: '' }));
                      }
                    }}
                    placeholder="••••••••"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={!showConfirmNewPassword}
                    value={passwordForm.confirmNewPassword}
                  />
                  <Pressable onPress={() => setShowConfirmNewPassword(!showConfirmNewPassword)}>
                    {showConfirmNewPassword ? (
                      <EyeOff color={passwordErrors.confirmNewPassword ? '#ef4444' : '#94a3b8'} size={16} />
                    ) : (
                      <Eye color={passwordErrors.confirmNewPassword ? '#ef4444' : '#94a3b8'} size={16} />
                    )}
                  </Pressable>
                </View>
                {passwordErrors.confirmNewPassword ? (
                  <Text className="mt-1.5 text-[11.5px] text-red-500 font-semibold">
                    {passwordErrors.confirmNewPassword}
                  </Text>
                ) : null}
              </View>

              {/* Button Submit Change Password */}
              <Pressable
                className={`h-11 flex-row items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-[#f97316]/20 shadow-md mt-2 active:bg-slate-200 dark:active:bg-slate-900 ${changingPw ? 'opacity-70' : ''}`}
                disabled={changingPw}
                onPress={handleChangePassword}
              >
                {changingPw ? (
                  <ActivityIndicator color="#f97316" size="small" />
                ) : (
                  <Text className="text-[14px] text-slate-800 dark:text-white font-bold">
                    Cập nhật mật khẩu
                  </Text>
                )}
              </Pressable>
            </View>
          </View>

          {/* Section: Hành động khác */}
          <View className="gap-3.5">
            <Pressable
              className="h-12 flex-row items-center justify-center rounded-xl border border-red-200 dark:border-red-900/20 bg-red-50 dark:bg-red-950/10 active:bg-red-100 dark:active:bg-red-950/20 gap-2.5"
              onPress={handleDeleteAccount}
            >
              <Trash2 color="#ef4444" size={18} />
              <Text className="text-[14px] text-red-500 dark:text-red-400 font-bold">
                Xóa tài khoản cá nhân
              </Text>
            </Pressable>

            <Pressable
              className="h-12 flex-row items-center justify-center rounded-xl border border-slate-250 dark:border-slate-800 bg-slate-100/50 dark:bg-[#0f172a]/45 active:bg-slate-200 dark:active:bg-[#0f172a]/70 gap-2.5"
              onPress={handleLogout}
            >
              <LogOut color="#94a3b8" size={18} />
              <Text className="text-[14px] text-slate-700 dark:text-slate-300 font-bold">
                Đăng xuất tài khoản
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Hàm chia họ và tên từ fullName
function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [parts[0] ?? '', ''];
  return [parts[0], parts.slice(1).join(' ')];
}

// Hàm lấy ký tự đầu làm Avatar Placeholder
function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(-2)
    .toUpperCase();
}
