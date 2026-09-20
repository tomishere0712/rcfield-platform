import React, { useEffect, useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
  Alert,
  StyleSheet,
  Text as NativeText,
} from 'react-native';
import { Calendar, Clock, Layers, ShieldCheck, AlertCircle, ChevronLeft, ChevronRight, X, Car, User } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Text } from '@/shared/ui/Text';
import { bookingWizardApi, type TrackConfig, type VehicleCatalog } from '../api/booking-wizard.api';
import type { Cafe } from '@/features/explore/types/explore.types';

const TRACK_PLACEHOLDER_IMAGE =
  'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?q=80&w=600&auto=format&fit=crop';

interface TrackSelectionStepProps {
  cafeId: string;
  selectedTrackConfig: TrackConfig | null;
  setSelectedTrackConfig: (track: TrackConfig) => void;
  selectedDate: string; // YYYY-MM-DD
  setSelectedDate: (date: string) => void;
  selectedSlots: string[]; // Array of selected HH:MM
  setSelectedSlots: (slots: string[]) => void;
  playMode: 'RENTAL' | 'BYOC';
  setPlayMode: (mode: 'RENTAL' | 'BYOC') => void;
  selectedVehicleIds: string[];
  setSelectedVehicleIds: (ids: string[]) => void;
  catalogs: VehicleCatalog[];
  cafe: Cafe | null;
}

interface SlotDetails {
  available: boolean;
  byocRemaining: number;
  vehiclesAvailable: number;
  blockedByNotice?: boolean;
}

interface SlotTiming {
  isPast: boolean;
  isTooSoon: boolean;
  isBlocked: boolean;
}

const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const MAX_CONSECUTIVE_SLOTS = 8;

function vietnamDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function toVietnamSlotDate(dateStr: string, slot: string) {
  return new Date(`${dateStr}T${slot}:00+07:00`);
}

function getSlotTiming(slot: string, dateStr: string, minNoticeMinutes = 0): SlotTiming {
  const todayStr = vietnamDateString();
  if (dateStr < todayStr) {
    return { isPast: true, isTooSoon: false, isBlocked: true };
  }
  if (dateStr > todayStr) {
    return { isPast: false, isTooSoon: false, isBlocked: false };
  }

  const slotDate = toVietnamSlotDate(dateStr, slot);
  const now = Date.now();
  const slotTime = slotDate.getTime();

  if (slotTime <= now) {
    return { isPast: true, isTooSoon: false, isBlocked: true };
  }

  if (minNoticeMinutes > 0 && slotTime < now + minNoticeMinutes * 60_000) {
    return { isPast: false, isTooSoon: true, isBlocked: true };
  }

  return { isPast: false, isTooSoon: false, isBlocked: false };
}

// Generate 7 days starting from today
const getNext7Days = () => {
  const list = [];
  const daysOfWeek = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${vietnamDateString()}T12:00:00+07:00`);
    d.setDate(d.getDate() + i);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const dateStr = String(d.getDate()).padStart(2, '0');
    const fullDate = `${year}-${month}-${dateStr}`;

    list.push({
      fullDate,
      dayLabel: daysOfWeek[d.getDay()],
      dateLabel: d.getDate(),
      isToday: i === 0,
    });
  }
  return list;
};

export function TrackSelectionStep({
  cafeId,
  selectedTrackConfig,
  setSelectedTrackConfig,
  selectedDate,
  setSelectedDate,
  selectedSlots,
  setSelectedSlots,
  playMode,
  setPlayMode,
  selectedVehicleIds,
  setSelectedVehicleIds,
  catalogs,
  cafe,
}: TrackSelectionStepProps) {
  const { colorScheme } = useColorScheme();
  const [tracks, setTracks] = useState<TrackConfig[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(true);
  const [slotDetails, setSlotDetails] = useState<Record<string, SlotDetails>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Generate dynamic time slots based on Cafe's operatingHours and slotDurationMinutes
  const timeSlots = React.useMemo(() => {
    if (!cafe || !Number.isInteger(cafe.slotDurationMinutes) || Number(cafe.slotDurationMinutes) <= 0) {
      return [];
    }

    let parsedHours: Record<string, any> = {};
    if (typeof cafe.operatingHours === 'string') {
      try {
        parsedHours = JSON.parse(cafe.operatingHours);
      } catch (e) {
        console.error('[TrackSelectionStep] Error parsing operatingHours string:', e);
      }
    } else if (cafe.operatingHours) {
      parsedHours = cafe.operatingHours;
    }

    // Get day of the week
    const dateObj = new Date(`${selectedDate}T12:00:00+07:00`);
    const dayIndex = dateObj.getUTCDay();
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = days[dayIndex];

    const schedule = parsedHours[dayKey];
    if (!schedule || schedule.is_closed || !schedule.open || !schedule.close) {
      return [];
    }

    const duration = Number(cafe.slotDurationMinutes);

    const timeToMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const minutesToTime = (min: number) => {
      const h = Math.floor(min / 60) % 24;
      const m = min % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const start = timeToMinutes(schedule.open);
    let end = timeToMinutes(schedule.close);
    if (end <= start) {
      end += 24 * 60;
    }

    const list: string[] = [];
    for (let current = start; current + duration <= end; current += duration) {
      list.push(minutesToTime(current));
    }
    return list;
  }, [cafe, selectedDate]);

  const scheduleConfigured = timeSlots.length > 0;
  const minNoticeMinutes = Math.max(0, Number(cafe?.minBookingNoticeMinutes || 0));
  const maxAdvanceBookingDays = Math.max(1, Number(cafe?.maxAdvanceBookingDays || 30));
  const latestBookableDate = React.useMemo(() => {
    const date = new Date(`${vietnamDateString()}T12:00:00+07:00`);
    date.setDate(date.getDate() + maxAdvanceBookingDays);
    return date.toISOString().slice(0, 10);
  }, [maxAdvanceBookingDays]);

  const isToday = selectedDate === vietnamDateString();

  // Popup warning when switching playMode from RENTAL to BYOC with selected vehicles
  const handleSelectByoc = () => {
    if (playMode === 'RENTAL' && selectedVehicleIds.length > 0) {
      const selectedNames = selectedVehicleIds
        .map((id) => catalogs.find((c) => c.id === id)?.name || `xe #${id.slice(0, 8).toUpperCase()}`)
        .join(', ');
      Alert.alert(
        'Chuyển sang mang xe riêng?',
        `Bạn đang có xe ${selectedNames} đã chọn để thuê. Chuyển sang chế độ mang xe riêng sẽ xóa toàn bộ lựa chọn xe thuê này.`,
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Đồng ý',
            style: 'destructive',
            onPress: () => {
              setSelectedVehicleIds([]);
              setPlayMode('BYOC');
            },
          },
        ]
      );
    } else {
      setPlayMode('BYOC');
    }
  };

  // Custom Calendar Modal State
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth()); // 0-indexed

  const daysList = getNext7Days().filter((item) => item.fullDate <= latestBookableDate);

  // Load track configs
  useEffect(() => {
    const fetchTracks = async () => {
      setLoadingTracks(true);
      const data = await bookingWizardApi.getCafeTrackConfigs(cafeId);
      setTracks(data);
      if (data.length > 0 && !selectedTrackConfig) {
        setSelectedTrackConfig(data[0]);
      }
      setLoadingTracks(false);
    };
    fetchTracks();
  }, [cafeId, selectedTrackConfig, setSelectedTrackConfig]);

  // Load slot availability when track, date or playMode changes
  useEffect(() => {
    if (!selectedTrackConfig || !selectedDate) return;

    const checkAllSlots = async () => {
      setLoadingSlots(true);
      setSlotDetails({}); // Clear old details immediately to show loader block and avoid UI jumping
      const updatedDetails: Record<string, SlotDetails> = {};

      try {
        await Promise.all(
          timeSlots.map(async (slot) => {
            const timing = getSlotTiming(slot, selectedDate, minNoticeMinutes);
            if (timing.isBlocked) {
              updatedDetails[slot] = {
                available: false,
                byocRemaining: 0,
                vehiclesAvailable: 0,
                blockedByNotice: timing.isTooSoon,
              };
              return;
            }

            const duration = Number(cafe?.slotDurationMinutes || 0);
            if (!duration) return;
            const [h, m] = slot.split(':').map(Number);
            const startMinutes = h * 60 + m;
            const endMinutes = startMinutes + duration;

            const endH = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0');
            const endM = String(endMinutes % 60).padStart(2, '0');

            // Handle date overflow when booking crosses midnight
            let endDateStr = selectedDate;
            if (endMinutes >= 24 * 60) {
              const d = new Date(`${selectedDate}T12:00:00+07:00`);
              d.setDate(d.getDate() + 1);
              const y = d.getFullYear();
              const mo = String(d.getMonth() + 1).padStart(2, '0');
              const da = String(d.getDate()).padStart(2, '0');
              endDateStr = `${y}-${mo}-${da}`;
            }

            const slotStart = `${selectedDate}T${slot}:00+07:00`;
            const slotEnd = `${endDateStr}T${endH}:${endM}:00+07:00`;

            try {
              const res = await bookingWizardApi.checkAvailability(cafeId, {
                slot_start: slotStart,
                slot_end: slotEnd,
                play_mode: playMode,
                track_config_id: selectedTrackConfig.id,
              });

              const vCount = res.vehicles?.length || 0;
              const byocRem = res.byoc_remaining || 0;
              const isAvail = playMode === 'RENTAL' ? vCount > 0 : byocRem > 0;

              updatedDetails[slot] = {
                available: isAvail,
                byocRemaining: byocRem,
                vehiclesAvailable: vCount,
              };
            } catch {
              updatedDetails[slot] = {
                available: false,
                byocRemaining: 0,
                vehiclesAvailable: 0,
              };
            }
          })
        );
        setSlotDetails(updatedDetails);
      } catch (err) {
        console.error('[TrackSelectionStep] Error checking slots:', err);
      } finally {
        setLoadingSlots(false);
      }
    };

    checkAllSlots();
  }, [cafeId, selectedTrackConfig, selectedDate, playMode, timeSlots, cafe, minNoticeMinutes]);

  // Month-Year Label formatting
  const formattedMonthYear = React.useMemo(() => {
    if (!selectedDate) return '';
    const [y, m] = selectedDate.split('-');
    return `Tháng ${m}, ${y}`;
  }, [selectedDate]);

  // Custom Calendar Data Generation
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const firstDayIndex = (() => {
    const day = new Date(calendarYear, calendarMonth, 1).getDay();
    return day === 0 ? 6 : day - 1; // CN=6, T2=0
  })();

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear((prev) => prev - 1);
    } else {
      setCalendarMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear((prev) => prev + 1);
    } else {
      setCalendarMonth((prev) => prev + 1);
    }
  };

  const handleSelectDateFromCalendar = (day: number) => {
    const yearStr = calendarYear;
    const monthStr = String(calendarMonth + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const fullDate = `${yearStr}-${monthStr}-${dayStr}`;

    if (fullDate > latestBookableDate) {
      Alert.alert('Ngoài thời hạn đặt trước', `Cơ sở chỉ nhận lịch trước tối đa ${maxAdvanceBookingDays} ngày.`);
      return;
    }

    setSelectedDate(fullDate);
    setSelectedSlots([]);
    setShowCalendar(false);
  };

  const handleToggleSlot = (slot: string) => {
    if (selectedSlots.includes(slot)) {
      setSelectedSlots(selectedSlots.filter((s) => s !== slot));
      return;
    }

    if (selectedSlots.length >= MAX_CONSECUTIVE_SLOTS) {
      Alert.alert('Đã đạt giới hạn', `Mỗi đơn chỉ được chọn tối đa ${MAX_CONSECUTIVE_SLOTS} slot liên tiếp.`);
      return;
    }

    if (selectedSlots.length === 0) {
      setSelectedSlots([slot]);
      return;
    }

    const candidateIndices = [...selectedSlots, slot]
      .map((value) => timeSlots.indexOf(value))
      .sort((a, b) => a - b);
    const isConsecutive = candidateIndices.every(
      (index, currentIndex) => currentIndex === 0 || index === candidateIndices[currentIndex - 1] + 1
    );
    if (!isConsecutive) {
      Alert.alert('Khung giờ không liên tiếp', 'Chỉ có thể chọn các slot liền kề trong cùng một phiên chơi.');
      return;
    }

    setSelectedSlots([...selectedSlots, slot].sort((a, b) => timeSlots.indexOf(a) - timeSlots.indexOf(b)));
  };

  const isDark = colorScheme === 'dark';

  return (
    <View className="space-y-6">
      {/* 1. Chọn loại sân */}
      <View>
        <View className="flex-row items-center gap-1.5 mb-3">
          <Layers color="#f97316" size={15} />
          <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
            1. Chọn loại sân chạy
          </Text>
        </View>

        {loadingTracks ? (
          <ActivityIndicator size="small" color="#f97316" className="py-4" />
        ) : tracks.length > 0 ? (
          <View className="gap-3">
            {tracks.map((track) => {
              const isSelected = selectedTrackConfig?.id === track.id;
              const trackImage = track.images?.[0] || TRACK_PLACEHOLDER_IMAGE;
              const trackName = track.track_type?.name || 'Sân đua RC';
              const trackDesc = track.description || track.track_type?.description || 'Chi tiết thông số cấu hình làn đua.';

              return (
                <Pressable
                  key={track.id}
                  onPress={() => setSelectedTrackConfig(track)}
                  className={`p-3 rounded-xl border flex-row gap-3 transition-all duration-200 ${
                    isSelected
                      ? 'bg-[#ea580c]/10 border-[#f97316]'
                      : 'bg-white dark:bg-[#0f172a]/50 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {/* Sân image */}
                  <Image
                    source={{ uri: trackImage }}
                    className="h-16 w-16 rounded-lg bg-slate-100 dark:bg-slate-900 object-cover"
                  />

                  {/* Sân Info */}
                  <View className="flex-1 pr-1 justify-between">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-[13px] text-slate-900 dark:text-white" weight="700">
                        {trackName}
                      </Text>
                      {isSelected && (
                        <View className="h-4.5 w-4.5 rounded-full bg-[#f97316] items-center justify-center">
                          <ShieldCheck color="#ffffff" size={11} strokeWidth={3} />
                        </View>
                      )}
                    </View>

                    <Text className="text-[10px] text-slate-500 dark:text-slate-400 leading-4 font-semibold" numberOfLines={1}>
                      {trackDesc}
                    </Text>

                    {/* Specs columns */}
                    <View className="flex-row gap-4 mt-1.5">
                      <View className="flex-row items-center gap-1">
                        <Car color="#ea580c" size={11} />
                        <Text className="text-[9px] text-slate-600 dark:text-slate-300 font-bold">
                          Thuê xe: Tối đa {track.max_concurrent} lượt
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <User color="#10b981" size={11} />
                        <Text className="text-[9px] text-slate-600 dark:text-slate-300 font-bold">
                          Xe riêng: Tối đa {track.byoc_capacity} lượt
                        </Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View className="bg-slate-100 dark:bg-slate-900/30 rounded-xl p-4 border border-dashed border-slate-200 dark:border-slate-800 items-center justify-center">
            <Text className="text-[12px] text-slate-500 dark:text-slate-400 font-semibold">
              Không có sân chơi khả dụng.
            </Text>
          </View>
        )}
      </View>

      {/* 2. Chọn hình thức chơi */}
      <View className="mt-5">
        <View className="flex-row items-center gap-1.5 mb-3">
          <Clock color="#f97316" size={15} />
          <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
            2. Chế độ chơi
          </Text>
        </View>

        <View className="flex-row gap-3">
          <Pressable
            onPress={() => setPlayMode('RENTAL')}
            className={`flex-1 p-3.5 rounded-xl border items-center justify-center ${
              playMode === 'RENTAL'
                ? 'bg-[#ea580c]/10 border-[#f97316]'
                : 'bg-white dark:bg-[#0f172a]/50 border-slate-200 dark:border-slate-800'
            }`}
          >
            <Text className={`text-[13px] ${playMode === 'RENTAL' ? 'text-[#f97316]' : 'text-slate-700 dark:text-slate-300'}`} weight="700">
              Thuê xe của quán
            </Text>
            <Text className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5 text-center font-semibold">
              Sử dụng xe đua của cửa hàng
            </Text>
          </Pressable>

          <Pressable
            onPress={handleSelectByoc}
            className={`flex-1 p-3.5 rounded-xl border items-center justify-center ${
              playMode === 'BYOC'
                ? 'bg-[#ea580c]/10 border-[#f97316]'
                : 'bg-white dark:bg-[#0f172a]/50 border-slate-200 dark:border-slate-800'
            }`}
          >
            <Text className={`text-[13px] ${playMode === 'BYOC' ? 'text-[#f97316]' : 'text-slate-700 dark:text-slate-300'}`} weight="700">
              Mang xe riêng
            </Text>
            <Text className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5 text-center font-semibold">
              Tự mang xe đã đăng ký của bạn
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 3. Chọn ngày */}
      <View className="mt-5">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-1.5">
            <Calendar color="#f97316" size={15} />
            <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
              3. Chọn ngày chơi
            </Text>
          </View>
          <Text className="text-[11px] text-slate-900 dark:text-white font-bold bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-800">
            {formattedMonthYear}
          </Text>
        </View>

        <View className="flex-row items-center gap-2.5">
          {/* List 7 days */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2.5"
            className="flex-1 py-1"
          >
            {daysList.map((item) => {
              const isSelected = selectedDate === item.fullDate;
              return (
                <Pressable
                  key={item.fullDate}
                  onPress={() => {
                    setSelectedDate(item.fullDate);
                    setSelectedSlots([]); // Reset slots when date changes
                  }}
                  className={`w-14 py-2.5 rounded-xl border items-center justify-center flex-col ${
                    isSelected
                      ? 'bg-[#ea580c] border-[#ea580c]'
                      : 'bg-white dark:bg-[#0f172a]/50 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <Text className={`text-[10px] ${isSelected ? 'text-white' : 'text-slate-500 dark:text-slate-400'} font-bold`}>
                    {item.dayLabel}
                  </Text>
                  <Text className={`text-[16px] mt-1 ${isSelected ? 'text-white' : 'text-slate-800 dark:text-slate-200'}`} weight="700">
                    {item.dateLabel}
                  </Text>
                  {item.isToday && (
                    <View className={`h-1.5 w-1.5 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-[#f97316]'}`} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Calendar Picker Trigger */}
          <Pressable
            onPress={() => {
              const [y, m] = selectedDate.split('-').map(Number);
              setCalendarYear(y);
              setCalendarMonth(m - 1);
              setShowCalendar(true);
            }}
            className="w-14 py-2.5 bg-white dark:bg-[#0f172a]/50 border border-slate-200 dark:border-slate-800 rounded-xl items-center justify-center flex-col active:bg-slate-100 dark:active:bg-slate-850"
          >
            <Calendar color="#f97316" size={16} />
            <Text className="text-[9.5px] text-slate-500 dark:text-slate-400 mt-1 font-bold">Khác</Text>
          </Pressable>
        </View>
      </View>

      {/* 4. Chọn giờ */}
      <View className="mt-5">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-1.5 flex-1 mr-2">
            <Clock color="#f97316" size={15} />
            <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold" numberOfLines={1}>
              4. Chọn khung giờ (Liên tiếp)
            </Text>
          </View>
          {loadingSlots && <ActivityIndicator size="small" color="#f97316" />}
        </View>

        {/* Legend */}
        <View className="flex-row items-center justify-start gap-4 mb-3">
          <View className="flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-full bg-emerald-500" />
            <Text className="text-[10px] text-slate-600 dark:text-slate-400 font-semibold">Khả dụng</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-full bg-[#ea580c]" />
            <Text className="text-[10px] text-slate-600 dark:text-slate-400 font-semibold">Đang chọn</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-full bg-slate-400" />
            <Text className="text-[10px] text-slate-600 dark:text-slate-400 font-semibold">Khóa/Hết</Text>
          </View>
        </View>

        {isToday && minNoticeMinutes > 0 ? (
          <View className="mb-3 flex-row items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertCircle color="#f59e0b" size={15} className="mt-0.5" />
            <Text className="flex-1 text-[11px] leading-4 text-amber-700 dark:text-amber-200">
              Cần đặt trước tối thiểu <Text className="font-bold">{minNoticeMinutes} phút</Text>. Các slot quá sát giờ bắt đầu sẽ bị khóa.
            </Text>
          </View>
        ) : null}

        {!scheduleConfigured ? (
          <View className="h-32 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 px-5">
            <Text className="text-center text-[12px] text-red-600 dark:text-red-300" weight="700">
              Cơ sở chưa cấu hình giờ hoạt động hoặc thời lượng slot hợp lệ.
            </Text>
            <Text className="mt-1 text-center text-[10px] leading-4 text-red-600/80 dark:text-red-200/70">
              Không thể tạo đơn cho đến khi cơ sở hoàn tất cấu hình lịch hoạt động.
            </Text>
          </View>
        ) : loadingSlots ? (
          <View className="h-32 items-center justify-center bg-white dark:bg-[#0f172a]/20 border border-slate-200 dark:border-slate-900 rounded-xl">
            <ActivityIndicator size="small" color="#f97316" />
            <Text className="text-[10px] text-slate-500 mt-2 font-semibold">
              Đang tải danh sách khung giờ trống...
            </Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {timeSlots.map((slot) => {
              const isSelected = selectedSlots.includes(slot);
              const detail = slotDetails[slot];
              const timing = getSlotTiming(slot, selectedDate, minNoticeMinutes);
              const isBookedOrClosed = detail ? !detail.available : false;
              const isSlotDisabled = timing.isBlocked || isBookedOrClosed;
              const isAvailable = !timing.isBlocked && (detail?.available ?? false);

              let statusLabel = '';
              if (timing.isPast) {
                statusLabel = 'Đã qua';
              } else if (timing.isTooSoon) {
                statusLabel = 'Quá sát';
              } else if (detail) {
                if (isAvailable) {
                  statusLabel =
                    playMode === 'RENTAL'
                      ? `Còn ${detail.vehiclesAvailable} xe`
                      : `Còn ${detail.byocRemaining} chỗ`;
                } else {
                  statusLabel = 'Hết chỗ';
                }
              } else {
                statusLabel = '...';
              }

              let btnBgStyle = isDark ? styles.slotBtnDefaultDark : styles.slotBtnDefault;
              let txtStyle = isDark ? styles.slotTextAvailableDark : styles.slotTextAvailable;
              let subTxtStyle = isDark ? styles.slotSubTextAvailableDark : styles.slotSubTextAvailable;

              if (isSelected) {
                btnBgStyle = styles.slotBtnSelected;
                txtStyle = styles.slotTextSelected;
                subTxtStyle = styles.slotSubTextSelected;
              } else if (timing.isPast) {
                btnBgStyle = isDark ? styles.slotBtnDisabledDark : styles.slotBtnDisabled;
                txtStyle = styles.slotTextPast;
                subTxtStyle = styles.slotSubTextPast;
              } else if (timing.isTooSoon) {
                btnBgStyle = isDark ? styles.slotBtnTooSoonDark : styles.slotBtnTooSoon;
                txtStyle = styles.slotTextTooSoon;
                subTxtStyle = styles.slotSubTextTooSoon;
              } else if (isSlotDisabled) {
                btnBgStyle = isDark ? styles.slotBtnDisabledDark : styles.slotBtnDisabled;
                txtStyle = styles.slotTextDisabled;
                subTxtStyle = styles.slotSubTextDisabled;
              } else if (isAvailable) {
                btnBgStyle = isDark ? styles.slotBtnAvailableDark : styles.slotBtnAvailable;
                txtStyle = isDark ? styles.slotTextAvailableDark : styles.slotTextAvailable;
                subTxtStyle = isDark ? styles.slotSubTextAvailableDark : styles.slotSubTextAvailable;
              }

              return (
                <Pressable
                  key={slot}
                  disabled={isSlotDisabled}
                  onPress={() => handleToggleSlot(slot)}
                  style={[styles.slotBtn, btnBgStyle]}
                >
                  <NativeText style={[styles.slotText, txtStyle]}>
                    {slot}
                  </NativeText>
                  <NativeText
                    numberOfLines={1}
                    style={[styles.slotSubText, subTxtStyle]}
                  >
                    {statusLabel}
                  </NativeText>
                </Pressable>
              );
            })}
          </View>
        )}

        {!loadingSlots &&
          Object.values(slotDetails).every((v) => v.available === false) &&
          Object.keys(slotDetails).length > 0 && (
            <View className="flex-row items-center gap-2 bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-xl p-3 mt-3">
              <AlertCircle color="#ef4444" size={15} />
              <Text className="text-[11px] text-[#ef4444] font-semibold flex-1">
                Khung giờ ngày này đã hết chỗ hoặc không khả dụng. Vui lòng chọn ngày khác!
              </Text>
            </View>
          )}
        {selectedSlots.length > 0 ? (
          <Text className="mt-3 text-[11px] text-slate-500 font-medium">
            Đã chọn {selectedSlots.length}/{MAX_CONSECUTIVE_SLOTS} slot liên tiếp.
          </Text>
        ) : null}
      </View>

      {/* CUSTOM CALENDAR MODAL */}
      <Modal
        visible={showCalendar}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCalendar(false)}
      >
        <View className="flex-1 bg-black/70 justify-center items-center px-5">
          <View className="w-full bg-white dark:bg-[#0b0f19] border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
            {/* Modal Header */}
            <View className="flex-row justify-between items-center mb-4 pb-2 border-b border-slate-200 dark:border-slate-900">
              <Text className="text-[14px] text-slate-900 dark:text-white" weight="700">
                Chọn ngày chơi khác
              </Text>
              <Pressable
                onPress={() => setShowCalendar(false)}
                className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 items-center justify-center"
              >
                <X color={colorScheme === 'dark' ? '#94a3b8' : '#475569'} size={14} />
              </Pressable>
            </View>

            {/* Month-Year Selector */}
            <View className="flex-row justify-between items-center mb-4">
              <Pressable
                onPress={handlePrevMonth}
                className="h-8 w-8 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg items-center justify-center active:bg-slate-200 dark:active:bg-slate-800"
              >
                <ChevronLeft color="#f97316" size={16} />
              </Pressable>
              <Text className="text-[13px] text-slate-900 dark:text-white" weight="700">
                {`Tháng ${String(calendarMonth + 1).padStart(2, '0')}, ${calendarYear}`}
              </Text>
              <Pressable
                onPress={handleNextMonth}
                className="h-8 w-8 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg items-center justify-center active:bg-slate-200 dark:active:bg-slate-800"
              >
                <ChevronRight color="#f97316" size={16} />
              </Pressable>
            </View>

            {/* Weekdays Header */}
            <View className="flex-row mb-2">
              {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
                <View key={d} className="flex-1 items-center py-1">
                  <Text className="text-[10px] text-slate-500 font-bold">{d}</Text>
                </View>
              ))}
            </View>

            {/* Calendar Grid */}
            <View className="flex-row flex-wrap">
              {/* Empty offset spaces */}
              {Array.from({ length: firstDayIndex }).map((_, i) => (
                <View key={`empty-${i}`} className="w-[14.28%] aspect-square justify-center items-center opacity-0" />
              ))}

              {/* Days digits */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;

                // Construct string date to check selection
                const checkingDate = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const isSelected = selectedDate === checkingDate;

                // Validate if day is in past
                const checkDateObj = new Date(calendarYear, calendarMonth, dayNum);
                const todayObj = new Date();
                todayObj.setHours(0, 0, 0, 0);
                const isPast = checkDateObj < todayObj;
                const isBeyondAdvanceLimit = checkingDate > latestBookableDate;

                return (
                  <Pressable
                    key={`day-${dayNum}`}
                    disabled={isPast || isBeyondAdvanceLimit}
                    onPress={() => handleSelectDateFromCalendar(dayNum)}
                    className={`w-[14.28%] aspect-square justify-center items-center rounded-lg border ${
                      isSelected
                        ? 'bg-[#ea580c] border-[#ea580c]'
                        : isPast || isBeyondAdvanceLimit
                        ? 'opacity-25 border-transparent'
                        : 'border-transparent active:bg-slate-100 dark:active:bg-slate-900'
                    }`}
                  >
                    <Text
                      className={`text-[12px] font-bold ${
                        isSelected
                          ? 'text-white'
                          : isPast
                          ? 'text-slate-400 dark:text-slate-600 line-through'
                          : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {dayNum}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  slotBtn: {
    width: '22.8%',
    minHeight: 50,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotBtnSelected: {
    backgroundColor: '#ea580c',
    borderColor: '#ea580c',
  },
  slotBtnAvailable: {
    backgroundColor: '#ecfdf5',
    borderColor: '#6ee7b7',
  },
  slotBtnAvailableDark: {
    backgroundColor: 'rgba(6, 78, 59, 0.25)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  slotBtnDisabled: {
    backgroundColor: 'rgba(241, 245, 249, 0.6)',
    borderColor: 'rgba(226, 232, 240, 0.6)',
    opacity: 0.4,
  },
  slotBtnDisabledDark: {
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
    borderColor: 'rgba(30, 41, 59, 0.4)',
    opacity: 0.4,
  },
  slotBtnTooSoon: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    opacity: 0.75,
  },
  slotBtnTooSoonDark: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    opacity: 0.75,
  },
  slotBtnDefault: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  slotBtnDefaultDark: {
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderColor: '#1e293b',
  },
  slotText: {
    fontSize: 12,
    fontFamily: 'BeVietnamPro_700Bold',
  },
  slotTextSelected: {
    color: '#ffffff',
  },
  slotTextPast: {
    color: '#94a3b8',
    textDecorationLine: 'line-through',
  },
  slotTextTooSoon: {
    color: '#d97706',
  },
  slotTextDisabled: {
    color: '#94a3b8',
  },
  slotTextAvailable: {
    color: '#047857',
  },
  slotTextAvailableDark: {
    color: '#34d399',
  },
  slotSubText: {
    fontSize: 8,
    fontFamily: 'BeVietnamPro_700Bold',
    marginTop: 2,
    textAlign: 'center',
  },
  slotSubTextSelected: {
    color: '#ffedd5',
  },
  slotSubTextPast: {
    color: '#94a3b8',
  },
  slotSubTextTooSoon: {
    color: '#b45309',
  },
  slotSubTextDisabled: {
    color: '#94a3b8',
  },
  slotSubTextAvailable: {
    color: '#059669',
  },
  slotSubTextAvailableDark: {
    color: '#34d399',
  },
});
