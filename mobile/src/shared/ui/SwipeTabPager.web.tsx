import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarDays,
  ClipboardCheck,
  Coffee,
  Compass,
  Home,
  Trophy,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { usePathname } from 'expo-router';

import { BookingListScreen } from '@/features/bookings/components/BookingListScreen';
import { ContestListScreen } from '@/features/contests/screens/ContestListScreen';
import { ExploreScreen } from '@/features/explore/components/ExploreScreen';
import { HomeScreen } from '@/features/home/components/HomeScreen';
import { ProfileScreen } from '@/features/profile/components/ProfileScreen';
import { StaffBookingsScreen } from '@/features/staff/components/StaffBookingsScreen';
import { StaffFnbOrdersScreen } from '@/features/staff/components/StaffFnbOrdersScreen';
import { StaffHomeScreen } from '@/features/staff/components/StaffHomeScreen';
import { useAuthStore } from '@/shared/store/auth-store';
import { subscribeMainTabRequests } from '@/shared/ui/main-tab-events';

const ACTIVE_COLOR = '#10b981';
const INACTIVE_COLOR = '#64748b';
const TAB_BAR_HEIGHT = 56;

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
  { key: 'contest', title: 'Giải đấu', href: '/contests', Icon: Trophy, Screen: ContestListScreen },
  { key: 'profile', title: 'Cá nhân', href: '/profile', Icon: UserRound, Screen: ProfileScreen },
];

const STAFF_TABS: MainTab[] = [
  { key: 'staff-home', title: 'Trực ca', href: '/', Icon: ClipboardCheck, Screen: StaffHomeScreen },
  { key: 'staff-bookings', title: 'Lịch sân', href: '/bookings', Icon: CalendarDays, Screen: StaffBookingsScreen },
  { key: 'staff-fnb', title: 'Đồ ăn', href: '/staff/fnb', Icon: Coffee, Screen: StaffFnbOrdersScreen },
  { key: 'profile', title: 'Cá nhân', href: '/profile', Icon: UserRound, Screen: ProfileScreen },
];

let globalActiveTabIdx = 0;

const WebTabPage = memo(function WebTabPage({
  isActive,
  isLoaded,
  Screen,
}: {
  isActive: boolean;
  isLoaded: boolean;
  Screen: React.ComponentType;
}) {
  return (
    <View style={[styles.page, { display: isActive ? 'flex' : 'none' }]}>
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
}: {
  index: number;
  title: string;
  Icon: LucideIcon;
  isActive: boolean;
  onPress: (index: number) => void;
}) {
  const handlePress = useCallback(() => onPress(index), [index, onPress]);
  const color: ColorValue = isActive ? ACTIVE_COLOR : INACTIVE_COLOR;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      onPress={handlePress}
      style={styles.tabButton}
    >
      <View style={styles.tabIconWrap}>
        <Icon color={String(color)} size={23} strokeWidth={2.15} />
        <Text numberOfLines={1} style={[styles.tabLabel, { color: String(color) }]}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
});

/**
 * react-native-pager-view is native-only. The web build keeps the same tab
 * contract and lazy screen mounting, while switching pages through the tab
 * bar instead of a native swipe pager.
 */
export function SwipeTabPager() {
  const insets = useSafeAreaInsets();
  const role = useAuthStore((state) => state.role);
  const tabs = role === 'staff' ? STAFF_TABS : CUSTOMER_TABS;
  const pathname = usePathname();
  const activeIndexRef = useRef(globalActiveTabIdx);
  const [activeIndex, setActiveIndex] = useState(globalActiveTabIdx);
  const [loadedIndexes, setLoadedIndexes] = useState(() => new Set([globalActiveTabIdx]));

  const markTabLoaded = useCallback((index: number) => {
    setLoadedIndexes((previous) => {
      if (previous.has(index)) return previous;
      const next = new Set(previous);
      next.add(index);
      return next;
    });
  }, []);

  const setActiveTab = useCallback(
    (index: number) => {
      if (index < 0 || index >= tabs.length) return;
      activeIndexRef.current = index;
      globalActiveTabIdx = index;
      markTabLoaded(index);
      setActiveIndex(index);
    },
    [markTabLoaded, tabs.length]
  );

  useEffect(() => {
    const matchedIndex = tabs.findIndex((tab) => {
      if (tab.href === '/') {
        return pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/';
      }
      return pathname === tab.href || pathname === `/(tabs)${tab.href}`;
    });

    if (matchedIndex !== -1 && matchedIndex !== activeIndexRef.current) {
      setActiveTab(matchedIndex === 0 && globalActiveTabIdx !== 0 ? globalActiveTabIdx : matchedIndex);
    }
  }, [pathname, setActiveTab, tabs]);

  useEffect(() => {
    if (activeIndexRef.current < tabs.length) return;
    setActiveTab(0);
    setLoadedIndexes(new Set([0]));
  }, [setActiveTab, tabs.length]);

  useEffect(() => subscribeMainTabRequests(setActiveTab), [setActiveTab]);

  return (
    <View className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]">
      <View style={styles.pager}>
        {tabs.map(({ key, Screen }, index) => (
          <WebTabPage
            key={key}
            isActive={activeIndex === index}
            isLoaded={loadedIndexes.has(index)}
            Screen={Screen}
          />
        ))}
      </View>

      <View
        className="flex-row items-center border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0b0f19]"
        style={{ height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }}
      >
        {tabs.map(({ key, title, Icon }, index) => (
          <TabBarItem
            key={key}
            index={index}
            title={title}
            Icon={Icon}
            isActive={activeIndex === index}
            onPress={setActiveTab}
          />
        ))}
      </View>
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
  tabButton: {
    flex: 1,
    height: '100%',
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrap: {
    width: '100%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    maxWidth: '100%',
    marginTop: 1,
    fontSize: 11,
    fontWeight: '600',
  },
});
