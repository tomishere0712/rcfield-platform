import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, SafeAreaView, Pressable, StyleSheet, ScrollView, TextInput, Modal } from 'react-native';
import { createScrollHandler } from '@/shared/ui/main-tab-events';
import { Trophy, AlertCircle, Search } from 'lucide-react-native';
import { contestsApi } from '../api/contests.api';
import { ContestCard } from '../components/ContestCard';
import type { Contest } from '../types/contests.types';
import { useColorScheme } from 'nativewind';

type ContestTabKey = 'ALL' | 'OPEN_RUNNING' | 'UPCOMING' | 'PAST';

interface ContestTabConfig {
  key: ContestTabKey;
  label: string;
}

const CONTEST_TABS: ContestTabConfig[] = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'OPEN_RUNNING', label: 'Đang diễn ra / Mở đăng ký' },
  { key: 'UPCOMING', label: 'Sắp mở đăng ký' },
  { key: 'PAST', label: 'Đã kết thúc' },
];

const FORMAT_OPTIONS = [
  { key: 'ALL', label: 'Tất cả thể thức' },
  { key: 'KNOCKOUT', label: 'Đấu loại trực tiếp' },
  { key: 'TIME_TRIAL', label: 'Đua tính giờ' },
  { key: 'QUALIFIER', label: 'Vòng loại + Chung kết' },
] as const;

type FormatKey = typeof FORMAT_OPTIONS[number]['key'];

export const ContestListScreen: React.FC = () => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const handleScroll = useRef(createScrollHandler()).current;
  const [activeTab, setActiveTab] = useState<ContestTabKey>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<FormatKey>('ALL');
  const [formatModalVisible, setFormatModalVisible] = useState(false);
  
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContests = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      // Gọi API lấy toàn bộ giải đấu công khai
      const allContests = await contestsApi.getPublicContests();
      const now = new Date();
      
      // Lọc đa chiều: Tab, Thể thức và Tên tìm kiếm
      const filtered = allContests.filter((c) => {
        const regOpensAt = c.registration_opens_at ? new Date(c.registration_opens_at) : null;
        
        // 1. Lọc theo Tab trạng thái
        let matchesTab = true;
        switch (activeTab) {
          case 'ALL':
            matchesTab = true;
            break;
          case 'OPEN_RUNNING':
            if (c.status === 'RUNNING') matchesTab = true;
            else if (c.status === 'OPEN') {
              matchesTab = !regOpensAt || regOpensAt <= now;
            } else {
              matchesTab = false;
            }
            break;
          case 'UPCOMING':
            matchesTab = c.status === 'OPEN' && !!regOpensAt && regOpensAt > now;
            break;
          case 'PAST':
            matchesTab = c.status === 'COMPLETED';
            break;
        }

        if (!matchesTab) return false;

        // 2. Lọc theo Thể thức (Format)
        let matchesFormat = true;
        if (selectedFormat === 'KNOCKOUT') {
          matchesFormat = c.contest_format?.code === 'KNOCKOUT' || c.config?.format === 'KNOCKOUT';
        } else if (selectedFormat === 'TIME_TRIAL') {
          matchesFormat = c.contest_format?.code === 'TIME_TRIAL' && c.config?.competition_mechanic !== 'QUALIFIER_TO_KNOCKOUT';
        } else if (selectedFormat === 'QUALIFIER') {
          matchesFormat = c.config?.competition_mechanic === 'QUALIFIER_TO_KNOCKOUT';
        }

        if (!matchesFormat) return false;

        // 3. Lọc theo Tên tìm kiếm (Search Query)
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase().trim();
          const nameMatches = c.name.toLowerCase().includes(query);
          const descMatches = c.description ? c.description.toLowerCase().includes(query) : false;
          return nameMatches || descMatches;
        }

        return true;
      });
      
      // Sắp xếp: Mới nhất lên đầu
      filtered.sort((a, b) => {
        const dateA = new Date(a.starts_at || 0).getTime();
        const dateB = new Date(b.starts_at || 0).getTime();
        return dateB - dateA;
      });

      setContests(filtered);
    } catch (err) {
      console.error('[ContestListScreen] Error:', err);
      setError('Không thể tải danh sách giải đấu. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchContests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedFormat, searchQuery]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchContests(false);
  };

  const getEmptyMessage = () => {
    if (searchQuery.trim()) {
      return `Không tìm thấy giải đấu phù hợp với "${searchQuery}"`;
    }
    switch (activeTab) {
      case 'OPEN_RUNNING':
        return 'Chưa có giải đấu nào đang diễn ra hoặc mở đăng ký';
      case 'UPCOMING':
        return 'Chưa có giải đấu nào sắp mở đăng ký';
      case 'PAST':
        return 'Chưa có giải đấu nào kết thúc';
      default:
        return 'Chưa có giải đấu nào được công bố';
    }
  };

  const renderEmptyComponent = () => {
    if (loading) return null;
    return (
      <View className="py-20 px-8 items-center justify-center bg-white dark:bg-[#0b0f19]">
        <Trophy size={48} color={isDark ? '#475569' : '#cbd5e1'} style={{ marginBottom: 12 }} />
        <Text className="text-base font-extrabold text-gray-700 dark:text-slate-300 text-center mb-1">
          {getEmptyMessage()}
        </Text>
        <Text className="text-xs font-semibold text-gray-400 dark:text-slate-500 text-center mt-1">
          Hãy quay lại kiểm tra sau hoặc theo dõi thông báo từ RC Field.
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-[#0b0f19]">
      {/* Header Title */}
      <View className="px-5 py-3 border-b border-gray-50 dark:border-slate-800/80 flex-row justify-between items-center bg-white dark:bg-[#0b0f19]">
        <Text className="text-xl font-extrabold text-gray-900 dark:text-white">Giải Đấu RC Field</Text>
      </View>

      {/* Search Bar & Dropdown Row */}
      <View style={[styles.filterRow, isDark && styles.filterRowDark]}>
        {/* Search Bar */}
        <View style={[styles.searchBar, isDark && styles.searchBarDark]}>
          <Search color="#94a3b8" size={15} />
          <TextInput
            placeholder="Tìm tên giải đấu..."
            placeholderTextColor="#94a3b8"
            style={[styles.searchInput, isDark && styles.searchInputDark]}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Text style={styles.clearText}>×</Text>
            </Pressable>
          )}
        </View>

        {/* Dropdown Button */}
        <Pressable
          onPress={() => setFormatModalVisible(true)}
          style={[styles.dropdownButton, isDark && styles.dropdownButtonDark]}
        >
          <Text style={[styles.dropdownText, isDark && styles.dropdownTextDark]} numberOfLines={1}>
            {FORMAT_OPTIONS.find((opt) => opt.key === selectedFormat)?.label}
          </Text>
          <Text style={styles.dropdownIcon}>▾</Text>
        </Pressable>
      </View>

      {/* Tabs Switcher using horizontal scroll view */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabScroll, isDark && styles.tabScrollDark]}
        contentContainerStyle={styles.tabScrollContent}
      >
        {CONTEST_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[
                styles.tabItem,
                isActive ? styles.tabItemActive : styles.tabItemInactive,
                isDark && (isActive ? styles.tabItemActiveDark : styles.tabItemInactiveDark)
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  isActive ? styles.tabTextActive : styles.tabTextInactive,
                  isDark && !isActive && styles.tabTextInactiveDark
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Error Message */}
      {error && (
        <View className="m-4 flex-row items-center bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 p-3 rounded-xl">
          <AlertCircle size={16} color="#ef4444" style={{ marginRight: 8 }} />
          <Text className="text-xs font-bold text-red-600 dark:text-red-400 flex-1">{error}</Text>
        </View>
      )}

      {/* Content List */}
      {loading && contests.length === 0 ? (
        <View className="flex-1 items-center justify-center bg-white dark:bg-[#0b0f19]">
          <ActivityIndicator size="large" color="#ea580c" />
        </View>
      ) : (
        <FlatList
          data={contests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ContestCard contest={item} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={renderEmptyComponent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ea580c']} />
          }
        />
      )}

      {/* Format Select Modal */}
      <Modal
        visible={formatModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFormatModalVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setFormatModalVisible(false)}
        >
          <View style={[styles.modalContent, isDark && styles.modalContentDark]}>
            <View style={[styles.modalHeader, isDark && styles.modalHeaderDark]}>
              <Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>Chọn thể thức thi đấu</Text>
            </View>
            <View style={styles.modalOptions}>
              {FORMAT_OPTIONS.map((opt) => {
                const isSelected = selectedFormat === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    style={[
                      styles.modalOption,
                      isSelected && styles.modalOptionActive,
                      isDark && isSelected && styles.modalOptionActiveDark
                    ]}
                    onPress={() => {
                      setSelectedFormat(opt.key);
                      setFormatModalVisible(false);
                    }}
                  >
                    <Text 
                      style={[
                        styles.modalOptionText,
                        isDark && styles.modalOptionTextDark,
                        isSelected && styles.modalOptionTextActive,
                        isDark && isSelected && styles.modalOptionTextActiveDark
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {isSelected && <Text style={styles.optionCheck}>✓</Text>}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241, 245, 249, 0.8)',
    gap: 10,
    backgroundColor: '#ffffff',
  },
  searchBar: {
    flex: 1.3,
    flexDirection: 'row',
    height: 38,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    backgroundColor: 'rgba(248, 250, 252, 0.5)',
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 6,
    fontSize: 12,
    color: '#0f172a',
    paddingVertical: 0,
    fontWeight: '600',
  },
  clearButton: {
    paddingHorizontal: 4,
  },
  clearText: {
    fontSize: 16,
    color: '#94a3b8',
    fontWeight: 'bold',
  },
  dropdownButton: {
    flex: 1,
    flexDirection: 'row',
    height: 38,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    backgroundColor: 'rgba(248, 250, 252, 0.5)',
    paddingHorizontal: 12,
  },
  dropdownText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    flex: 1,
    marginRight: 4,
  },
  dropdownIcon: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: 'bold',
  },
  tabScroll: {
    flexGrow: 0,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241, 245, 249, 0.8)',
    backgroundColor: '#ffffff',
  },
  tabScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tabItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  tabItemActive: {
    backgroundColor: '#fff7ed',
    borderColor: '#ffedd5',
  },
  tabItemInactive: {
    backgroundColor: 'rgba(248, 250, 252, 0.8)',
    borderColor: 'rgba(226, 232, 240, 0.6)',
  },
  tabText: {
    fontSize: 12,
  },
  tabTextActive: {
    fontWeight: '800',
    color: '#ea580c',
  },
  tabTextInactive: {
    fontWeight: '600',
    color: '#64748b',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241, 245, 249, 0.8)',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalOptions: {
    padding: 8,
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  modalOptionActive: {
    backgroundColor: '#fff7ed',
  },
  modalOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  modalOptionTextActive: {
    fontWeight: '800',
    color: '#ea580c',
  },
  optionCheck: {
    fontSize: 12,
    color: '#ea580c',
    fontWeight: 'bold',
  },
  // Các style mới cho Dark Mode
  filterRowDark: {
    backgroundColor: '#0b0f19',
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchBarDark: {
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
  },
  searchInputDark: {
    color: '#ffffff',
  },
  dropdownButtonDark: {
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
  },
  dropdownTextDark: {
    color: '#cbd5e1',
  },
  tabScrollDark: {
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: '#0b0f19',
  },
  tabItemActiveDark: {
    backgroundColor: '#2c1a0e',
    borderColor: '#432611',
  },
  tabItemInactiveDark: {
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  tabTextInactiveDark: {
    color: '#94a3b8',
  },
  modalContentDark: {
    backgroundColor: '#0f172a',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
  },
  modalHeaderDark: {
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitleDark: {
    color: '#ffffff',
  },
  modalOptionActiveDark: {
    backgroundColor: '#2c1a0e',
  },
  modalOptionTextDark: {
    color: '#94a3b8',
  },
  modalOptionTextActiveDark: {
    color: '#ea580c',
  },
});
