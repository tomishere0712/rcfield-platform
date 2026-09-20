import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarDays,
  ClipboardCheck,
  Coffee,
  Compass,
  Home,
  UserRound,
  Trophy,
  type LucideIcon,
} from 'lucide-react-native';
import { usePathname } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useColorScheme } from 'nativewind';

import { BookingListScreen } from '@/features/bookings/components/BookingListScreen';
import { ExploreScreen } from '@/features/explore/components/ExploreScreen';
import { HomeScreen } from '@/features/home/components/HomeScreen';
import { ProfileScreen } from '@/features/profile/components/ProfileScreen';
import { StaffBookingsScreen } from '@/features/staff/components/StaffBookingsScreen';
import { StaffFnbOrdersScreen } from '@/features/staff/components/StaffFnbOrdersScreen';
import { StaffHomeScreen } from '@/features/staff/components/StaffHomeScreen';
import { ContestListScreen } from '@/features/contests/screens/ContestListScreen';
import { useAuthStore } from '@/shared/store/auth-store';
import { subscribeMainTabRequests, subscribeTabBarVisibility } from '@/shared/ui/main-tab-events';

const ACTIVE_COLOR = '#ea580c'; // Đổi sang màu cam thương hiệu
const INACTIVE_COLOR = '#64748b';

type MainTab = {
  key: string;
  title: string;
  href: string;
  Icon: LucideIcon;
  Screen: React.ComponentType;
};

const CUSTOMER_TABS: MainTab[] = [
  { key: 'home', title: 'Trang chủ', href: '/', Icon: Home, Screen: HomeScreen },
  { key: 'explore', title: 'Khám phá', href: '/explore', Icon: Compass, Screen: ExploreScreen },
  { key: 'bookings', title: 'Lịch đặt', href: '/bookings', Icon: CalendarDays, Screen: BookingListScreen },
  { key: 'profile', title: 'Cá nhân', href: '/profile', Icon: UserRound, Screen: ProfileScreen },
  { key: 'contest', title: 'Giải đấu', href: '/contests', Icon: Trophy, Screen: ContestListScreen },
];

const STAFF_TABS: MainTab[] = [
  { key: 'staff-home', title: 'Trực ca', href: '/', Icon: ClipboardCheck, Screen: StaffHomeScreen },
  { key: 'staff-bookings', title: 'Lịch sân', href: '/bookings', Icon: CalendarDays, Screen: StaffBookingsScreen },
  { key: 'staff-fnb', title: 'Đồ ăn', href: '/staff/fnb', Icon: Coffee, Screen: StaffFnbOrdersScreen },
  { key: 'profile', title: 'Cá nhân', href: '/profile', Icon: UserRound, Screen: ProfileScreen },
];

let globalActiveTabIdx = 0;

const PagerScreen = memo(function PagerScreen({
  isLoaded,
  Screen,
}: {
  isLoaded: boolean;
  Screen: React.ComponentType;
}) {
  return (
    <View style={styles.page} collapsable={false}>
      {isLoaded ? <Screen /> : null}
    </View>
  );
});

const TabBarItem = memo(function TabBarItem({
  index,
  title,
  Icon,
  isActive,
  onPress,
  isDark,
}: {
  index: number;
  title: string;
  Icon: LucideIcon;
  isActive: boolean;
  onPress: (index: number) => void;
  isDark: boolean;
}) {
  const handlePress = useCallback(() => onPress(index), [index, onPress]);
  const color: ColorValue = isActive ? ACTIVE_COLOR : (isDark ? '#94a3b8' : INACTIVE_COLOR);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      onPress={handlePress}
      style={styles.tabButton}
    >
      <View style={[
        styles.tabIconWrap,
        isActive && {
          backgroundColor: 'rgba(234, 88, 12, 0.2)', // Màu cam trong suốt
          borderRadius: 22,
          width: '90%',
          height: '80%',
        }
      ]}>
        <Icon color={String(color)} size={18} strokeWidth={2.2} />
        <Text numberOfLines={1} style={[styles.tabLabel, { color: String(color) }]}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
});

export function SwipeTabPager() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const role = useAuthStore((state) => state.role);
  const tabs = role === 'staff' ? STAFF_TABS : CUSTOMER_TABS;
  const pagerRef = useRef<PagerView>(null);
  const [activeIndex, setActiveIndex] = useState(globalActiveTabIdx);
  const [loadedIndexes, setLoadedIndexes] = useState(() => new Set([globalActiveTabIdx]));
  const activeIndexRef = useRef(globalActiveTabIdx);
  const pathname = usePathname();

  // Animation values cho việc ẩn/hiện TabBar khi cuộn
  const translateY = useSharedValue(0);

  useEffect(() => {
    // Đăng ký nhận sự kiện ẩn/hiện từ các Screen con
    return subscribeTabBarVisibility((visible) => {
      // Chiều cao dịch chuyển xuống = chiều cao tab bar + safe area bottom + padding
      translateY.value = withTiming(visible ? 0 : 120, { duration: 250 });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedBottomBarStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  // Luôn khôi phục TabBar khi chuyển tab hoặc chuyển route
  useEffect(() => {
    translateY.value = withTiming(0, { duration: 200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, pathname]);

  // Lắng nghe thay đổi của route để đồng bộ hóa tab hiện tại
  useEffect(() => {
    const matchedIndex = tabs.findIndex((tab) => {
      if (tab.href === '/') {
        return pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/';
      }
      return pathname === tab.href || pathname === `/(tabs)${tab.href}`;
    });

    if (matchedIndex !== -1 && matchedIndex !== activeIndexRef.current) {
      let targetIndex = matchedIndex;
      if (matchedIndex === 0 && globalActiveTabIdx !== 0) {
        targetIndex = globalActiveTabIdx;
      }

      if (targetIndex !== activeIndexRef.current) {
        activeIndexRef.current = targetIndex;
        setActiveIndex(targetIndex);
        setLoadedIndexes((previous) => {
          if (previous.has(targetIndex)) {
            return previous;
          }
          const next = new Set(previous);
          next.add(targetIndex);
          return next;
        });
        globalActiveTabIdx = targetIndex;
        pagerRef.current?.setPageWithoutAnimation(targetIndex);
      }
    }
  }, [pathname, tabs]);

  const markTabLoaded = useCallback((index: number) => {
    setLoadedIndexes((previous) => {
      if (previous.has(index)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(index);
      return next;
    });
  }, []);

  useEffect(() => {
    if (activeIndexRef.current < tabs.length) {
      markTabLoaded(activeIndexRef.current);
      return;
    }

    activeIndexRef.current = 0;
    globalActiveTabIdx = 0;
    setActiveIndex(0);
    setLoadedIndexes(new Set([0]));
    pagerRef.current?.setPageWithoutAnimation(0);
  }, [markTabLoaded, tabs.length]);

  useEffect(() => {
    return subscribeMainTabRequests((index) => {
      if (index < 0 || index >= tabs.length || index === activeIndexRef.current) {
        return;
      }

      activeIndexRef.current = index;
      setActiveIndex(index);
      markTabLoaded(index);
      globalActiveTabIdx = index;
      pagerRef.current?.setPageWithoutAnimation(index);
    });
  }, [markTabLoaded, tabs.length]);

  const setActiveTab = useCallback((index: number) => {
    activeIndexRef.current = index;
    setActiveIndex(index);
    markTabLoaded(index);
    globalActiveTabIdx = index;
  }, [markTabLoaded]);

  const handlePageSelected = useCallback(
    (event: { nativeEvent: { position: number } }) => {
      const position = event.nativeEvent.position;
      if (position !== activeIndexRef.current) {
        setActiveTab(position);
      }
    },
    [setActiveTab],
  );

  const handleTabPress = useCallback((index: number) => {
    if (index === activeIndexRef.current) {
      return;
    }

    activeIndexRef.current = index;
    setActiveIndex(index);
    markTabLoaded(index);
    globalActiveTabIdx = index;
    pagerRef.current?.setPageWithoutAnimation(index);
  }, [markTabLoaded]);

  // Layout 5 tabs chia thành: 4 tab bên trái và 1 tab "Giải đấu" tròn tách biệt bên phải
  const isCustomerWithContest = tabs.length === 5;

  return (
    <View className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]">
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={Math.min(globalActiveTabIdx, tabs.length - 1)}
        offscreenPageLimit={1}
        overScrollMode="never"
        onPageSelected={handlePageSelected}
      >
        {tabs.map(({ key, Screen }, index) => (
          <PagerScreen key={key} isLoaded={loadedIndexes.has(index)} Screen={Screen} />
        ))}
      </PagerView>

      {/* Floating Bottom Navigation Bar (Xanh SM style) */}
      <Animated.View
        style={[
          animatedBottomBarStyle,
          styles.bottomBarWrapper,
          { bottom: Math.max(insets.bottom, 12) },
        ]}
      >
        {isCustomerWithContest ? (
          <>
            {/* Section A: Main 4-item pill container */}
            <View style={[styles.sectionAPill, isDark && styles.sectionAPillDark]}>
              {tabs.slice(0, 4).map(({ key, title, Icon }, index) => (
                <TabBarItem
                  key={key}
                  index={index}
                  title={title}
                  Icon={Icon}
                  isActive={activeIndex === index}
                  onPress={handleTabPress}
                  isDark={isDark}
                />
              ))}
            </View>

            {/* Section B: Separated Floating Button for "Contest" */}
            <Pressable
              onPress={() => handleTabPress(4)}
              style={[
                styles.sectionBButton,
                isDark && styles.sectionBButtonDark,
                activeIndex === 4 ? styles.sectionBActive : (isDark ? styles.sectionBInactiveDark : styles.sectionBInactive),
              ]}
              android_ripple={{ color: '#ffedd5', borderless: true, radius: 26 }}
            >
              <Trophy 
                color={activeIndex === 4 ? '#ea580c' : '#fbbf24'} 
                fill="#f59e0b" 
                size={22} 
                strokeWidth={2} 
              />
            </Pressable>
          </>
        ) : (
          /* Staff Layout: 4 tab floating hợp nhất */
          <View style={[styles.sectionAPill, isDark && styles.sectionAPillDark, { marginRight: 0 }]}>
            {tabs.map(({ key, title, Icon }, index) => (
              <TabBarItem
                key={key}
                index={index}
                title={title}
                Icon={Icon}
                isActive={activeIndex === index}
                onPress={handleTabPress}
                isDark={isDark}
              />
            ))}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  bottomBarWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    pointerEvents: 'box-none', // Cho phép bấm xuyên qua vùng khoảng trống
  },
  sectionAPill: {
    flex: 1,
    flexDirection: 'row',
    height: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.9)', // Trong suốt hơi mờ
    borderRadius: 30,
    marginRight: 10,
    alignItems: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    // Shadow nhẹ mờ
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  sectionBButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ffffff', // Nền luôn màu trắng
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    // Shadow
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  sectionBInactive: {
    borderColor: 'rgba(226, 232, 240, 0.9)', // Viền xám nhẹ mờ khi không active
  },
  sectionBActive: {
    borderColor: '#ea580c', // Viền cam khi active
    shadowColor: '#ea580c',
    shadowOpacity: 0.2,
  },
  tabButton: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
  },
  sectionAPillDark: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  sectionBButtonDark: {
    backgroundColor: '#0f172a',
  },
  sectionBInactiveDark: {
    borderColor: 'rgba(51, 65, 85, 0.9)',
  },
});
