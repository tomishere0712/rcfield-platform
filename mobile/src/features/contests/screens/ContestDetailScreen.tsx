import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator, Pressable, Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar, MapPin, ShieldAlert, Trophy, CreditCard, Flag } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { contestsApi } from '../api/contests.api';
import { getVnpayReturnUrl } from '@/shared/lib/vnpay-return-url';
import { openVnpayPaymentSession } from '@/shared/lib/vnpay-browser';
import { bookingWizardApi } from '@/features/bookings/api/booking-wizard.api';
import { TournamentBracket } from '../components/TournamentBracket';
import type { Contest, ContestMatch } from '../types/contests.types';

WebBrowser.maybeCompleteAuthSession();

type SubTabKey = 'INFO' | 'BRACKET' | 'LEADERBOARD';

export const ContestDetailScreen: React.FC = () => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  
  const [contest, setContest] = useState<Contest | null>(null);
  const [matches, setMatches] = useState<ContestMatch[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<SubTabKey>('INFO');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchContestData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const detail = await contestsApi.getContestDetail(id);
      console.log('[ContestDetailScreen] fetchContestData success:', {
        id: detail?.id,
        name: detail?.name,
        status: detail?.status,
        my_registration: detail?.my_registration ? {
          id: detail.my_registration.id,
          status: detail.my_registration.status,
          payment_status: detail.my_registration.payment_status,
          booking_id: detail.my_registration.booking_id
        } : null
      });
      setContest(detail);

      // Nếu giải đấu đã bốc thăm, tải các trận đấu
      if (detail && detail.status !== 'DRAFT') {
        const matchData = await contestsApi.getContestMatches(id);
        setMatches(matchData);
      }
    } catch (error) {
      console.error('[ContestDetailScreen] Error fetching data:', error);
      Alert.alert('Lỗi', 'Không thể tải chi tiết giải đấu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContestData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleRegisterPress = () => {
    if (!contest) return;
    router.push(`/customer/contest-register/${contest.id}` as any);
  };

  const handlePaymentPress = async () => {
    const regId = contest?.my_registration?.id;
    const bookingId = contest?.my_registration?.booking_id;
    if (!regId) return;

    setActionLoading(true);
    try {
      const returnUrl = getVnpayReturnUrl() || 'rcfield://payment-return';
      let result;
      
      if (bookingId) {
        result = await bookingWizardApi.createCheckout(bookingId, returnUrl, 'vnpay');
      } else {
        result = await contestsApi.createEntryFeePayment(regId, returnUrl);
      }
      
      if (result && result.payment_url) {
        await openVnpayPaymentSession(result.payment_url!);
        
        // Polling để đợi Backend cập nhật trạng thái thanh toán từ VNPay IPN
        let attempts = 0;
        const maxAttempts = 4;
        const interval = 1500;
        
        const poll = async () => {
          try {
            const detail = await contestsApi.getContestDetail(id);
            console.log(`[ContestDetailScreen] Polling payment status attempt ${attempts + 1}:`, {
              status: detail?.my_registration?.status,
              payment_status: detail?.my_registration?.payment_status
            });
            
            if (
              detail?.my_registration?.payment_status === 'MARKED_PAID' ||
              detail?.my_registration?.status === 'CONFIRMED'
            ) {
              console.log('[ContestDetailScreen] Payment confirmed via polling!');
              setContest(detail);
              if (detail && detail.status !== 'DRAFT') {
                const matchData = await contestsApi.getContestMatches(id);
                setMatches(matchData);
              }
              return;
            }
          } catch (e) {
            console.error('[ContestDetailScreen] Polling error:', e);
          }
          
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(poll, interval);
          } else {
            console.log('[ContestDetailScreen] Polling finished, performing final data fetch.');
            fetchContestData();
          }
        };
        
        // Chờ 500ms trước khi bắt đầu check lần đầu
        setTimeout(poll, 500);
      } else {
        Alert.alert('Thất bại', 'Không thể tạo liên kết thanh toán VNPay.');
      }
    } catch (error: any) {
      console.error('[ContestDetailScreen] Payment error:', error);
      const errMsg = error?.response?.data?.message || 'Đã xảy ra lỗi trong quá trình xử lý thanh toán.';
      Alert.alert('Không thể thanh toán', errMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    if (price === undefined || price === null) return 'Miễn phí';
    if (price === 0) return 'Miễn phí';
    return `${price.toLocaleString('vi-VN')} VND`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Chưa định ngày';
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateShort = (dateString: string | null) => {
    if (!dateString) return 'Chưa định ngày';
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isPastDate = (dateString: string | null) => {
    if (!dateString) return false;
    return new Date(dateString) <= new Date();
  };

  // Trích xuất danh sách avatar tay đua đăng ký từ danh sách trận đấu
  const topEntrants = useMemo(() => {
    const map = new Map<string, { name: string; avatar: string | null }>();
    matches.forEach((match) => {
      match.participants.forEach((p) => {
        if (p.registration_id) {
          const regId = p.registration?.id || p.registration_id;
          const name = p.registration?.participant_name || p.fullName || 'Racer';
          const avatar = p.registration?.participant_avatar_url || null;
          if (name !== 'Chờ vòng trước' && name !== 'Không có đối thủ') {
            map.set(regId, { name, avatar });
          }
        }
      });
    });
    return Array.from(map.values()).slice(0, 5);
  }, [matches]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, isDark && styles.loadingContainerDark]}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  if (!contest) {
    return (
      <View style={[styles.errorContainer, isDark && styles.errorContainerDark]}>
        <ShieldAlert size={48} color="#ef4444" style={{ marginBottom: 12 }} />
        <Text className="text-base font-extrabold text-gray-800 dark:text-slate-200 text-center">Không tìm thấy giải đấu</Text>
        <Text className="text-xs font-semibold text-gray-400 dark:text-slate-500 text-center mt-1">Giải đấu có thể đã bị xóa hoặc không khả dụng.</Text>
      </View>
    );
  }

  const defaultBanner = 'https://images.unsplash.com/photo-1568605117036-5fecc6207a71?auto=format&fit=crop&w=600&q=80';
  const myReg = contest.my_registration;
  const branchName = contest.host_branch?.cafe?.name || 'RC Field Branch';
  const trackImage = contest.track_type?.image_url || contest.config?.track_image_url || contest.track_type?.layout_image_url || null;

  return (
    <SafeAreaView style={[styles.safeArea, isDark && styles.safeAreaDark]} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1, backgroundColor: isDark ? '#0b0f19' : '#ffffff' }}>
        {/* Toàn bộ nội dung cuộn trang đồng bộ */}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {/* Banner & Title Glass Card lồng đè lên nhau */}
          <View style={styles.bannerContainer}>
            <Image
              source={contest.banner_image_url ? { uri: contest.banner_image_url } : { uri: defaultBanner }}
              style={styles.bannerImage}
              resizeMode="cover"
            />
            {/* Nút quay lại */}
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Text style={styles.backButtonText}>←</Text>
            </Pressable>

            {/* Title Glass Card lơ lửng đè lên Banner */}
            <View style={[styles.headerGlassCard, isDark && styles.headerGlassCardDark]}>
              <Text style={[styles.headerTitle, isDark && styles.headerTitleDark]}>{contest.name}</Text>
              <View style={styles.headerMetaRow}>
                <View style={styles.headerMetaItem}>
                  <MapPin size={10} color="#ea580c" style={{ marginRight: 4 }} />
                  <Text style={[styles.headerMetaText, isDark && styles.headerMetaTextDark]} numberOfLines={1}>{branchName}</Text>
                </View>
                <View style={styles.headerMetaItem}>
                  <Calendar size={10} color="#ea580c" style={{ marginRight: 4 }} />
                  <Text style={[styles.headerMetaText, isDark && styles.headerMetaTextDark]}>{formatDate(contest.starts_at)}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Sub Tabs Switcher */}
          <View style={[styles.tabContainer, isDark && styles.tabContainerDark]}>
            <Pressable
              onPress={() => setActiveSubTab('INFO')}
              style={[styles.tabItem, activeSubTab === 'INFO' ? styles.tabItemActive : styles.tabItemInactive, isDark && activeSubTab === 'INFO' && styles.tabItemActiveDark]}
            >
              <Text style={[styles.tabText, activeSubTab === 'INFO' ? (isDark ? styles.tabTextActiveDark : styles.tabTextActive) : styles.tabTextInactive]}>
                Thông tin
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setActiveSubTab('BRACKET')}
              style={[styles.tabItem, activeSubTab === 'BRACKET' ? styles.tabItemActive : styles.tabItemInactive, isDark && activeSubTab === 'BRACKET' && styles.tabItemActiveDark]}
            >
              <Text style={[styles.tabText, activeSubTab === 'BRACKET' ? (isDark ? styles.tabTextActiveDark : styles.tabTextActive) : styles.tabTextInactive]}>
                Sơ đồ đấu
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setActiveSubTab('LEADERBOARD')}
              style={[styles.tabItem, activeSubTab === 'LEADERBOARD' ? styles.tabItemActive : styles.tabItemInactive, isDark && activeSubTab === 'LEADERBOARD' && styles.tabItemActiveDark]}
            >
              <Text style={[styles.tabText, activeSubTab === 'LEADERBOARD' ? (isDark ? styles.tabTextActiveDark : styles.tabTextActive) : styles.tabTextInactive]}>
                Bảng xếp hạng
              </Text>
            </Pressable>
          </View>

          {/* Tab Content Area */}
          <View style={{ padding: 16 }}>
            {activeSubTab === 'INFO' && (
              <View>
                {/* 1. Quick Stats Grid - Thể hiện Lệ phí và Danh sách Tay đua Avatar Overlap */}
                <View style={styles.statsGrid}>
                  {/* Lệ phí */}
                  <View style={[styles.statsCardSmall, isDark && styles.statsCardSmallDark]}>
                    <View style={[styles.statsIconWrapper, isDark && styles.statsIconWrapperDark]}>
                      <CreditCard size={16} color="#ea580c" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.statsLabel}>Lệ phí</Text>
                      <Text style={[styles.statsValue, isDark && styles.statsValueDark]}>{formatPrice(contest.entry_fee)}</Text>
                    </View>
                  </View>

                  {/* Danh sách người chơi Đăng ký (Overlap Avatars) */}
                  <View style={[styles.statsCardLong, isDark && styles.statsCardLongDark]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.statsLabel}>Đã đăng ký</Text>
                      <Text style={[styles.statsValue, isDark && styles.statsValueDark]}>
                        {contest.public_stats?.registration_count || 0} / {contest.capacity || '∞'} VĐV
                      </Text>
                    </View>

                    {topEntrants.length > 0 && (
                      <View style={styles.avatarOverlapContainer}>
                        {topEntrants.map((entrant, idx) => (
                          <View
                            key={idx}
                            style={[
                              styles.avatarBubble,
                              { marginLeft: idx === 0 ? 0 : -10, zIndex: idx, borderColor: isDark ? '#1e293b' : '#ffffff' }
                            ]}
                          >
                            {entrant.avatar ? (
                              <Image source={{ uri: entrant.avatar }} style={styles.avatarImage} />
                            ) : (
                              <View style={styles.avatarPlaceholder}>
                                <Text style={styles.avatarPlaceholderText}>
                                  {entrant.name.charAt(0).toUpperCase()}
                                </Text>
                              </View>
                            )}
                          </View>
                        ))}
                        {contest.public_stats?.registration_count && contest.public_stats.registration_count > topEntrants.length && (
                          <View style={[styles.avatarMoreBadge, { zIndex: topEntrants.length, backgroundColor: isDark ? '#2c1a0e' : '#fff7ed', borderColor: isDark ? '#432611' : '#ffedd5' }]}>
                            <Text style={styles.avatarMoreText}>
                              +{contest.public_stats.registration_count - topEntrants.length}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                </View>

                {/* 2. Description Section */}
                <View style={styles.sectionContainer}>
                  <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Giới thiệu giải đấu</Text>
                  <Text style={[styles.sectionBody, isDark && styles.sectionBodyDark]}>
                    {contest.description || 'Chưa có thông tin mô tả chi tiết cho giải đấu này.'}
                  </Text>
                </View>

                {/* 3. Rules & Vehicles Section (Quy chế - Ý tưởng 3) */}
                <View style={styles.sectionContainer}>
                  <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Quy chế & Dòng xe thi đấu</Text>
                  <View style={[styles.ruleCardList, isDark && styles.ruleCardListDark]}>
                    {/* Thể thức */}
                    <View style={styles.ruleItem}>
                      <View style={styles.ruleBullet} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.ruleTextTitle, isDark && styles.ruleTextTitleDark]}>Thể thức thi đấu</Text>
                        <Text style={[styles.ruleTextDesc, isDark && styles.ruleTextDescDark]}>
                          {contest.contest_format?.name || 'Đấu loại trực tiếp 1v1 (Knockout)'}
                        </Text>
                      </View>
                    </View>

                    {/* Quy định xe */}
                    <View style={styles.ruleItem}>
                      <View style={styles.ruleBullet} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.ruleTextTitle, isDark && styles.ruleTextTitleDark]}>Quy định dòng xe</Text>
                        <Text style={[styles.ruleTextDesc, isDark && styles.ruleTextDescDark]}>
                          {contest.vehicle_rule?.vehicle_policy === 'RENTAL_ONLY' ? 'Chỉ sử dụng xe thuê của cơ sở.' :
                           contest.vehicle_rule?.vehicle_policy === 'BYOC_ONLY' ? 'Chỉ sử dụng xe cá nhân tự mang theo (BYOC).' :
                           'Hỗn hợp (MIXED) - Sử dụng xe thuê hoặc xe cá nhân tùy chọn.'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* 4. Track Information Section (Lá cờ fallback hoặc Ảnh đường đua thực tế) */}
                <View style={styles.sectionContainer}>
                  <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Thông tin đường đua</Text>
                  <View style={[styles.trackCard, isDark && styles.trackCardDark]}>
                    {trackImage ? (
                      <Image source={{ uri: trackImage }} style={styles.trackImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.trackIconWrapper, isDark && styles.trackIconWrapperDark]}>
                        <Flag size={20} color="#ea580c" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.trackName, isDark && styles.trackNameDark]}>{contest.track_type?.name || 'Đường đua RC Field'}</Text>
                      <Text style={[styles.trackDesc, isDark && styles.trackDescDark]}>
                        {contest.track_type?.description || 'Đường đua chuyên nghiệp được thiết kế với các góc cua kỹ thuật khó, phù hợp với các giải đấu đối kháng đỉnh cao.'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 5. Horizontal Timeline Progress Bar (Lịch trình nằm ngang) */}
                <View style={styles.sectionContainer}>
                  <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Tiến trình giải đấu</Text>
                  <View style={[styles.horizTimelineContainer, isDark && styles.horizTimelineContainerDark]}>
                    <View style={[styles.horizTimelineLineBg, { backgroundColor: isDark ? '#334155' : '#cbd5e1' }]} />
                    <View 
                      style={[
                        styles.horizTimelineLineActive,
                        isPastDate(contest.ends_at)
                          ? { right: '12.5%' }
                          : isPastDate(contest.starts_at)
                          ? { right: '37.5%' }
                          : isPastDate(contest.registration_closes_at)
                          ? { right: '62.5%' }
                          : { width: 0 }
                      ]}
                    />

                    {/* Mốc 1: Mở đăng ký */}
                    <View style={styles.horizTimelineStep}>
                      <View style={[styles.horizTimelineDot, { backgroundColor: isDark ? '#0b0f19' : '#ffffff' }, isPastDate(contest.registration_opens_at) ? styles.horizTimelineDotActive : [styles.horizTimelineDotInactive, { borderColor: isDark ? '#334155' : '#cbd5e1' }]]}>
                        <Text style={[styles.horizTimelineStepNum, isPastDate(contest.registration_opens_at) && styles.horizTimelineStepNumActive]}>1</Text>
                      </View>
                      <Text style={[styles.horizTimelineLabel, isDark && styles.horizTimelineLabelDark]}>Mở Đăng Ký</Text>
                      <Text style={[styles.horizTimelineTime, isDark && styles.horizTimelineTimeDark]}>{formatDateShort(contest.registration_opens_at)}</Text>
                    </View>

                    {/* Mốc 2: Đóng đăng ký */}
                    <View style={styles.horizTimelineStep}>
                      <View style={[styles.horizTimelineDot, { backgroundColor: isDark ? '#0b0f19' : '#ffffff' }, isPastDate(contest.registration_closes_at) ? styles.horizTimelineDotActive : [styles.horizTimelineDotInactive, { borderColor: isDark ? '#334155' : '#cbd5e1' }]]}>
                        <Text style={[styles.horizTimelineStepNum, isPastDate(contest.registration_closes_at) && styles.horizTimelineStepNumActive]}>2</Text>
                      </View>
                      <Text style={[styles.horizTimelineLabel, isDark && styles.horizTimelineLabelDark]}>Đóng Đăng Ký</Text>
                      <Text style={[styles.horizTimelineTime, isDark && styles.horizTimelineTimeDark]}>{formatDateShort(contest.registration_closes_at)}</Text>
                    </View>

                    {/* Mốc 3: Khai mạc */}
                    <View style={styles.horizTimelineStep}>
                      <View style={[styles.horizTimelineDot, { backgroundColor: isDark ? '#0b0f19' : '#ffffff' }, isPastDate(contest.starts_at) ? styles.horizTimelineDotActive : [styles.horizTimelineDotInactive, { borderColor: isDark ? '#334155' : '#cbd5e1' }]]}>
                        <Text style={[styles.horizTimelineStepNum, isPastDate(contest.starts_at) && styles.horizTimelineStepNumActive]}>3</Text>
                      </View>
                      <Text style={[styles.horizTimelineLabel, isDark && styles.horizTimelineLabelDark]}>Khởi Tranh</Text>
                      <Text style={[styles.horizTimelineTime, isDark && styles.horizTimelineTimeDark]}>{formatDateShort(contest.starts_at)}</Text>
                    </View>

                    {/* Mốc 4: Kết thúc */}
                    <View style={styles.horizTimelineStep}>
                      <View style={[styles.horizTimelineDot, { backgroundColor: isDark ? '#0b0f19' : '#ffffff' }, isPastDate(contest.ends_at) ? styles.horizTimelineDotActive : [styles.horizTimelineDotInactive, { borderColor: isDark ? '#334155' : '#cbd5e1' }]]}>
                        <Text style={[styles.horizTimelineStepNum, isPastDate(contest.ends_at) && styles.horizTimelineStepNumActive]}>4</Text>
                      </View>
                      <Text style={[styles.horizTimelineLabel, isDark && styles.horizTimelineLabelDark]}>Kết Thúc</Text>
                      <Text style={[styles.horizTimelineTime, isDark && styles.horizTimelineTimeDark]}>{formatDateShort(contest.ends_at)}</Text>
                    </View>
                  </View>
                </View>

                {/* 6. Prizes Section (Thiết kế đứng Premium Tier List) */}
                {contest.prize_structure && contest.prize_structure.length > 0 && (
                  <View style={styles.sectionContainer}>
                    <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Cơ cấu giải thưởng</Text>
                    <View className="gap-3">
                      {contest.prize_structure.map((prize: any, idx: number) => {
                        const rank = prize.rank || (idx + 1);
                        
                        // Cấu hình style sang trọng cho từng hạng giải
                        let cardBg = 'bg-amber-50/40 dark:bg-amber-950/10';
                        let borderColor = 'border-amber-200/80 dark:border-amber-500/20';
                        let badgeBg = 'bg-amber-100 dark:bg-amber-500/20';
                        let badgeText = 'text-amber-700 dark:text-amber-400';
                        let medalLabel = 'Giải Nhất';
                        let medalSymbol = '🏆';
                        
                        if (rank === 2) {
                          cardBg = 'bg-slate-50/50 dark:bg-slate-900/10';
                          borderColor = 'border-slate-200/80 dark:border-slate-800/30';
                          badgeBg = 'bg-slate-100 dark:bg-slate-800/60';
                          badgeText = 'text-slate-700 dark:text-slate-350';
                          medalLabel = 'Giải Nhì';
                          medalSymbol = '🥈';
                        } else if (rank === 3) {
                          cardBg = 'bg-orange-50/30 dark:bg-orange-950/5';
                          borderColor = 'border-orange-200/50 dark:border-orange-900/20';
                          badgeBg = 'bg-orange-100/80 dark:bg-orange-950/30';
                          badgeText = 'text-orange-700 dark:text-orange-400';
                          medalLabel = 'Giải Ba';
                          medalSymbol = '🥉';
                        } else if (rank > 3) {
                          cardBg = 'bg-gray-50/30 dark:bg-gray-900/5';
                          borderColor = 'border-gray-100 dark:border-gray-800/30';
                          badgeBg = 'bg-gray-100 dark:bg-gray-800/40';
                          badgeText = 'text-gray-600 dark:text-gray-400';
                          medalLabel = `Giải khuyến khích`;
                          medalSymbol = '🏅';
                        }

                        return (
                          <View
                            key={idx}
                            className={`flex-row items-center p-4 rounded-2xl border ${borderColor} ${cardBg}`}
                          >
                            {/* Medal Big Icon */}
                            <View className={`h-12 w-12 rounded-xl items-center justify-center mr-4 ${badgeBg}`}>
                              <Text className="text-xl">{medalSymbol}</Text>
                            </View>

                            {/* Prize Content */}
                            <View className="flex-1 pr-2">
                              <View className="flex-row items-center gap-1.5 mb-1">
                                <Text className={`text-[10px] font-extrabold uppercase tracking-wider ${badgeText}`}>
                                  {medalLabel}
                                </Text>
                              </View>
                              <Text className="text-xs font-extrabold text-slate-850 dark:text-white" numberOfLines={1}>
                                {prize.title}
                              </Text>
                              {prize.description ? (
                                <Text className="text-[10px] font-semibold text-slate-405 dark:text-slate-400 mt-0.5 leading-4" numberOfLines={2}>
                                  {prize.description}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            )}

            {activeSubTab === 'BRACKET' && (
              <View>
                <TournamentBracket matches={matches} isDark={isDark} myRegistrationId={myReg?.id} />
              </View>
            )}

            {activeSubTab === 'LEADERBOARD' && (
              <View>
                <Text className="text-sm font-extrabold text-gray-900 dark:text-white mb-3">Kết quả chung cuộc</Text>
                
                {contest.published_leaderboard?.entries && contest.published_leaderboard.entries.length > 0 ? (
                  <View className="border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-gray-50 dark:divide-slate-800 bg-white dark:bg-[#0f172a]/60">
                    {contest.published_leaderboard.entries.map((entry) => (
                      <View key={entry.registration_id} className="flex-row items-center p-3">
                        {/* Rank Number */}
                        <View className="h-6 w-6 rounded-full bg-gray-100 dark:bg-slate-800 items-center justify-center mr-3">
                          <Text className={`text-xs font-extrabold ${entry.rank <= 3 ? 'text-amber-600' : 'text-gray-600 dark:text-slate-400'}`}>
                            {entry.rank}
                          </Text>
                        </View>
                        {/* Driver Name */}
                        <View className="flex-1">
                          <Text className="text-xs font-extrabold text-gray-800 dark:text-slate-200">
                            {entry.display_name || entry.driver_handle || `Tay đua #${entry.registration_id.substring(0, 6).toUpperCase()}`}
                          </Text>
                          <Text className="text-[10px] font-semibold text-gray-400 dark:text-slate-500">
                            {contest.config?.format === 'TIME_TRIAL'
                              ? `Best Lap: ${((entry.best_lap_ms || (entry.best_lap_seconds ? entry.best_lap_seconds * 1000 : 0)) / 1000).toFixed(2)}s`
                              : `Wins: ${entry.wins} trận`}
                          </Text>
                        </View>
                        {/* Badge Trophy */}
                        {entry.rank === 1 && <Trophy size={16} color="#f59e0b" />}
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={{ paddingVertical: 48, alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
                    <Trophy size={36} color={isDark ? '#475569' : '#d1d5db'} style={{ alignSelf: 'center', marginBottom: 8 }} />
                    <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 italic text-center">Bảng xếp hạng sẽ được công bố khi giải đấu kết thúc.</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </ScrollView>

        {/* Bottom Bar: Action Register / Payment / Status */}
        <View 
          className="p-4 border-t border-gray-100 dark:border-slate-800/80 bg-white dark:bg-[#0b0f19]"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          {/* Trường hợp Chưa đăng ký hoặc đã hủy, và giải đang mở */}
          {(!myReg || myReg.status === 'CANCELLED') && contest.status === 'OPEN' && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleRegisterPress}
              className="w-full bg-orange-600 py-3.5 rounded-xl items-center justify-center shadow-sm"
            >
              <Text className="text-sm font-extrabold text-white">ĐĂNG KÝ THAM GIA ({formatPrice(contest.entry_fee)})</Text>
            </TouchableOpacity>
          )}

          {/* Trường hợp Đã đăng ký nhưng Chưa đóng lệ phí */}
          {myReg && myReg.status !== 'CANCELLED' && myReg.payment_status === 'PENDING_PAYMENT' && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handlePaymentPress}
              disabled={actionLoading}
              className="w-full bg-emerald-600 py-3.5 rounded-xl flex-row items-center justify-center shadow-sm"
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <CreditCard size={16} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text className="text-sm font-extrabold text-white">THANH TOÁN LỆ PHÍ VNPAY</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Trường hợp Đã xác nhận / Đang thi đấu */}
          {myReg && myReg.status !== 'CANCELLED' && myReg.payment_status !== 'PENDING_PAYMENT' && (
            <View className="w-full bg-gray-50 dark:bg-slate-900/30 border border-gray-100 dark:border-slate-800/80 p-3 rounded-xl flex-row justify-between items-center">
              <View className="flex-1 pr-3">
                <Text className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Trạng thái của bạn</Text>
                <Text className="text-xs font-extrabold text-gray-800 dark:text-slate-200" numberOfLines={1}>
                  {myReg.status === 'CONFIRMED' ? 'Đã đăng ký (Chờ thi đấu)' : 
                   myReg.status === 'CHECKED_IN' ? 'Đã điểm danh (Sẵn sàng đấu)' : 
                   'Chờ Ban tổ chức phê duyệt'}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push('/customer/my-contests' as any)}
                className="bg-orange-50 dark:bg-orange-950/20 border border-orange-100/80 dark:border-orange-900/30 px-3 py-1.5 rounded-lg"
              >
                <Text className="text-[10px] font-extrabold text-orange-600">Xem vé / QR</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Giải đấu đã đóng đăng ký / Đang chạy / Đã xong mà khách chưa đăng ký hoặc đã hủy */}
          {(!myReg || myReg.status === 'CANCELLED') && contest.status !== 'OPEN' && (
            <View className="w-full bg-gray-50 dark:bg-slate-900/30 border border-gray-100 dark:border-slate-800/80 p-3.5 rounded-xl items-center justify-center">
              <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 italic">
                {contest.status === 'COMPLETED' ? 'Giải đấu đã kết thúc' : 'Đã hết thời gian đăng ký giải đấu này.'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  loadingContainerDark: {
    backgroundColor: '#0b0f19',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    padding: 24,
  },
  errorContainerDark: {
    backgroundColor: '#0b0f19',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  safeAreaDark: {
    backgroundColor: '#0b0f19',
  },
  bannerContainer: {
    position: 'relative',
    height: 240,
    width: '100%',
    backgroundColor: '#f1f5f9',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    top: 16,
    height: 40,
    width: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  backButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  headerGlassCard: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  headerGlassCardDark: {
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
    lineHeight: 18,
    marginBottom: 6,
  },
  headerTitleDark: {
    color: '#ffffff',
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '50%',
  },
  headerMetaText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
  },
  headerMetaTextDark: {
    color: '#94a3b8',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#fafafa',
  },
  tabContainerDark: {
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: '#0f172a',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
  },
  tabItemActive: {
    borderBottomColor: '#ea580c',
  },
  tabItemActiveDark: {
    borderBottomColor: '#ea580c',
  },
  tabItemInactive: {
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 12,
  },
  tabTextActive: {
    fontWeight: '800',
    color: '#0f172a',
  },
  tabTextActiveDark: {
    fontWeight: '800',
    color: '#ffffff',
  },
  tabTextInactive: {
    fontWeight: '600',
    color: '#94a3b8',
  },
  // Các style mới cho Tab Info
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statsCardSmall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  statsCardSmallDark: {
    backgroundColor: 'rgba(30, 41, 59, 0.3)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statsCardLong: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderRadius: 16,
    padding: 12,
  },
  statsCardLongDark: {
    backgroundColor: 'rgba(30, 41, 59, 0.3)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statsIconWrapper: {
    height: 32,
    width: 32,
    borderRadius: 10,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsIconWrapperDark: {
    backgroundColor: '#2c1a0e',
  },
  statsLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 2,
  },
  statsValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f172a',
  },
  statsValueDark: {
    color: '#ffffff',
  },
  avatarOverlapContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBubble: {
    height: 24,
    width: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#ffffff',
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  avatarPlaceholder: {
    height: '100%',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fdba74',
  },
  avatarPlaceholderText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#ea580c',
  },
  avatarMoreBadge: {
    height: 24,
    width: 24,
    borderRadius: 12,
    backgroundColor: '#fff7ed',
    borderWidth: 1.5,
    borderColor: '#ffedd5',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -10,
  },
  avatarMoreText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#ea580c',
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
  },
  sectionTitleDark: {
    color: '#ffffff',
  },
  sectionBody: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    lineHeight: 18,
  },
  sectionBodyDark: {
    color: '#cbd5e1',
  },
  ruleCardList: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#ffedd5',
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  ruleCardListDark: {
    backgroundColor: '#2c1a0e',
    borderColor: '#432611',
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  ruleBullet: {
    height: 6,
    width: 6,
    borderRadius: 3,
    backgroundColor: '#ea580c',
    marginTop: 6,
  },
  ruleTextTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7c2d12',
    marginBottom: 2,
  },
  ruleTextTitleDark: {
    color: '#fdba74',
  },
  ruleTextDesc: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9a3412',
    lineHeight: 15,
  },
  ruleTextDescDark: {
    color: '#fed7aa',
  },
  trackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  trackCardDark: {
    backgroundColor: 'rgba(30, 41, 59, 0.3)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  trackIconWrapper: {
    height: 40,
    width: 40,
    borderRadius: 12,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackIconWrapperDark: {
    backgroundColor: '#2c1a0e',
  },
  trackImage: {
    height: 40,
    width: 40,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  trackName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 2,
  },
  trackNameDark: {
    color: '#ffffff',
  },
  trackDesc: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    lineHeight: 16,
  },
  trackDescDark: {
    color: '#94a3b8',
  },
  prizesCarouselContent: {
    paddingRight: 16,
    gap: 12,
  },
  prizeCardCarousel: {
    width: 180,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    alignItems: 'flex-start',
  },
  prizeCardCarouselDark: {
    backgroundColor: 'rgba(30, 41, 59, 0.3)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  prizeBadge: {
    height: 32,
    width: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  prizeTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 2,
    width: '100%',
  },
  prizeTitleDark: {
    color: '#ffffff',
  },
  prizeDesc: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    width: '100%',
    lineHeight: 14,
  },
  prizeDescDark: {
    color: '#94a3b8',
  },
  prizeRankLabel: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  // Style cho Horizontal Timeline
  horizTimelineContainer: {
    position: 'relative',
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderRadius: 16,
    padding: 16,
    paddingTop: 24,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  horizTimelineContainerDark: {
    backgroundColor: 'rgba(30, 41, 59, 0.3)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  horizTimelineLineBg: {
    position: 'absolute',
    top: 32,
    left: '12.5%',
    right: '12.5%',
    height: 3,
    backgroundColor: '#cbd5e1',
  },
  horizTimelineLineActive: {
    position: 'absolute',
    top: 32,
    left: '12.5%',
    height: 3,
    backgroundColor: '#ea580c',
  },
  horizTimelineStep: {
    flex: 1,
    alignItems: 'center',
  },
  horizTimelineDot: {
    height: 20,
    width: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    zIndex: 2,
    marginBottom: 8,
  },
  horizTimelineDotActive: {
    borderColor: '#ea580c',
    backgroundColor: '#ea580c',
  },
  horizTimelineDotInactive: {
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  horizTimelineStepNum: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
  },
  horizTimelineStepNumActive: {
    color: '#ffffff',
  },
  horizTimelineLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 2,
    textAlign: 'center',
  },
  horizTimelineLabelDark: {
    color: '#ffffff',
  },
  horizTimelineTime: {
    fontSize: 8,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  horizTimelineTimeDark: {
    color: '#94a3b8',
  },
});
