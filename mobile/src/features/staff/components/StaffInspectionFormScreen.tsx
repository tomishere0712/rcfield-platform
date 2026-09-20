import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  FileCheck,
  ImagePlus,
  Info,
  Plus,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { uploadImage } from '@/features/auth/api/auth.api';
import {
  staffApi,
  type DamageLineItemInput,
  type DamagePartType,
  type StaffInspectionType,
  type StaffSessionDetail,
} from '@/features/staff/api/staff.api';
import { ImageZoomModal } from '@/shared/ui/ImageZoomModal';
import { Text } from '@/shared/ui/Text';

const MIN_RENTAL_INSPECTION_PHOTOS = 4;
const MAX_RENTAL_INSPECTION_PHOTOS = 6;
const INSPECTION_IMAGE_MAX_EDGE = 1280;
const INSPECTION_IMAGE_COMPRESS = 0.55;
const INSPECTION_UPLOAD_TIMEOUT_MS = 90000;

export const PART_TYPE_LABELS: Record<string, string> = {
  CHASSIS: 'Khung gầm',
  SHELL: 'Vỏ nhựa (Shell)',
  SPOILER: 'Cánh gió',
  TIRE_WHEEL: 'Bánh xe / Lốp',
  MOTOR: 'Motor / Động cơ',
  SERVO: 'Servo / Tay lái',
  REMOTE: 'Remote / Điều khiển',
  OTHER: 'Khác',
};

type RentalPhotoItem = {
  id: string;
  uri?: string;
  url: string;
  notes: string;
  uploading?: boolean;
};

type ByocPhotoItem = {
  participantName: string;
  uri?: string;
  url: string;
  notes: string;
  uploading?: boolean;
};

type ChecklistStateItem = {
  id: string;
  label: string;
  checked: boolean;
  notes?: string;
  partType?: string;
};

function formatCurrency(value: number) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

function isByocSession(session?: StaffSessionDetail | null) {
  if (!session?.vehicles?.length) return false;
  return session.vehicles.every((vehicle) => vehicle.type === 'BYOC');
}

function getInspectionUploadErrorMessage(error: any) {
  if (error?.code === 'ECONNABORTED') {
    return 'Upload ảnh quá lâu do mạng chậm hoặc ảnh quá nặng. Ảnh đã được nén, vui lòng thử lại.';
  }
  if (error?.response?.status === 413) {
    return 'Ảnh vẫn quá lớn sau khi nén. Vui lòng chụp lại gần hơn hoặc chọn ảnh nhẹ hơn.';
  }
  if (!error?.response && error?.message) {
    return 'Không kết nối được máy chủ upload. Kiểm tra Wi-Fi/4G và địa chỉ API rồi thử lại.';
  }
  return error?.response?.data?.message || 'Không thể upload ảnh kiểm xe.';
}

async function optimizeInspectionImage(asset: ImagePicker.ImagePickerAsset) {
  const width = Number(asset.width || 0);
  const height = Number(asset.height || 0);
  const actions =
    width > 0 && height > 0 && Math.max(width, height) > INSPECTION_IMAGE_MAX_EDGE
      ? [
          width >= height
            ? { resize: { width: INSPECTION_IMAGE_MAX_EDGE } }
            : { resize: { height: INSPECTION_IMAGE_MAX_EDGE } },
        ]
      : [];

  return manipulateAsync(asset.uri, actions, {
    compress: INSPECTION_IMAGE_COMPRESS,
    format: SaveFormat.JPEG,
  });
}

export function StaffInspectionFormScreen({
  sessionId,
  type,
}: {
  sessionId: string;
  type: StaffInspectionType;
}) {
  const router = useRouter();
  const [session, setSession] = useState<StaffSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isClosingByoc, setIsClosingByoc] = useState(false);

  // RENTAL photos
  const [rentalPhotos, setRentalPhotos] = useState<RentalPhotoItem[]>([]);
  const [isUploadingRentalPhotos, setIsUploadingRentalPhotos] = useState(false);

  // BYOC photos (1 slot per participant)
  const [byocPhotos, setByocPhotos] = useState<ByocPhotoItem[]>([]);

  // Checklist
  const [checklist, setChecklist] = useState<ChecklistStateItem[]>([]);
  const [staffNotes, setStaffNotes] = useState('');

  // Damage items (RENTAL CHECK_OUT only)
  const [damageFlagged, setDamageFlagged] = useState(false);
  const [damageLineItems, setDamageLineItems] = useState<DamageLineItemInput[]>([]);

  // Baseline comparison for CHECK_OUT
  const [showCheckInBaselines, setShowCheckInBaselines] = useState(false);

  // Photo Zoom preview
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string } | null>(null);

  const isByoc = useMemo(() => isByocSession(session), [session]);
  const isCheckIn = type === 'CHECK_IN';

  const checkInInspection = useMemo(() => {
    return session?.inspections?.find((i) => i.type === 'CHECK_IN');
  }, [session]);

  const totalDamageCharge = useMemo(
    () =>
      damageLineItems.reduce(
        (sum, item) => sum + Number(item.partsPrice || 0) + Number(item.laborPrice || 0),
        0
      ),
    [damageLineItems]
  );

  const remainingRentalPhotos = Math.max(0, MIN_RENTAL_INSPECTION_PHOTOS - rentalPhotos.length);

  // Load session data
  const loadSession = useCallback(async () => {
    setLoading(true);
    try {
      const data = await staffApi.getSessionDetail(sessionId);
      setSession(data);
      const byoc = isByocSession(data);

      // Initialize Checklist according to Web standards
      if (byoc) {
        setChecklist([
          { id: 'byoc-1', label: 'Khách đến đúng giờ và xuất trình xe cá nhân', checked: true },
          {
            id: 'byoc-2',
            label: 'Xe của khách đã được kiểm tra an toàn cơ bản (pin, remote)',
            checked: true,
          },
          {
            id: 'byoc-3',
            label: 'Khách đã xác nhận tự chịu trách nhiệm về xe cá nhân',
            checked: true,
          },
        ]);

        const participantNames =
          data.participants && data.participants.length > 0
            ? data.participants.map((p) => p.name || 'Người chơi')
            : ['Người chơi 1'];

        setByocPhotos(
          participantNames.map((name) => ({
            participantName: name,
            url: '',
            notes: '',
          }))
        );
      } else if (type === 'CHECK_IN') {
        setChecklist([
          { id: 'ck-in-battery', label: 'Pin đủ điện, đã sạc trước ca', checked: true },
          { id: 'ck-in-servo', label: 'Tay lái servo phản hồi tốt, bẻ cua bình thường', checked: true },
          { id: 'ck-in-tire', label: 'Lốp và bánh xe gắn chắc chắn, không lung lay', checked: true },
          { id: 'ck-in-remote', label: 'Remote bắt sóng nhạy, xe phản hồi lệnh ổn định', checked: true },
          { id: 'ck-in-chassis', label: 'Khung gầm và vỏ xe nguyên vẹn trước khi giao', checked: true },
        ]);
      } else if (type === 'CHECK_OUT') {
        const existingCheckOut = data.inspections?.find((i: any) => i.type === 'CHECK_OUT');
        const defaultChecklist: ChecklistStateItem[] = [
          { id: 'ck-chassis', partType: 'CHASSIS', label: 'Khung gầm xe (nứt, gãy, cong vênh, biến dạng)', checked: true },
          { id: 'ck-shell', partType: 'SHELL', label: 'Vỏ nhựa xe / Shell (móp méo, rách vỡ, xước sâu)', checked: true },
          { id: 'ck-spoiler', partType: 'SPOILER', label: 'Cánh gió (gãy, biến dạng, rơi rụng)', checked: true },
          { id: 'ck-tire', partType: 'TIRE_WHEEL', label: 'Bánh xe & Lốp (văng ốc hex, mòn rách, kẹt trục)', checked: true },
          { id: 'ck-motor', partType: 'MOTOR', label: 'Motor / Động cơ (kẹt quay, quá nhiệt, mùi khét)', checked: true },
          { id: 'ck-servo', partType: 'SERVO', label: 'Hệ thống lái / Servo (kẹt góc, trượt bánh răng)', checked: true },
          { id: 'ck-remote', partType: 'REMOTE', label: 'Remote điều khiển (đủ tay cầm, cần lái nguyên vẹn)', checked: true },
        ];

        if (existingCheckOut) {
          if (existingCheckOut.staffNotes) {
            setStaffNotes(existingCheckOut.staffNotes);
          }
          if (existingCheckOut.photos?.length) {
            setRentalPhotos(
              existingCheckOut.photos.map((p: any, idx: number) => ({
                id: `existing-${p.angle || idx}-${idx}`,
                url: p.url,
                notes: p.notes || '',
              }))
            );
          }
          if (existingCheckOut.damageFlagged && existingCheckOut.damageLineItems?.length) {
            setDamageFlagged(true);
            setDamageLineItems(
              existingCheckOut.damageLineItems.map((li: any) => ({
                partType: li.partType,
                customPartName: li.customPartName || '',
                partsPrice: Number(li.partsPrice || 0),
                laborPrice: Number(li.laborPrice || 0),
              }))
            );
          }
          if (existingCheckOut.checklist?.length) {
            const statusByKey = new Map(existingCheckOut.checklist.map((c: any) => [c.itemKey || c.id, c]));
            setChecklist(
              defaultChecklist.map((item) => {
                const existingItem: any = statusByKey.get(item.id);
                const isOk = !existingItem || existingItem.status === 'OK' || existingItem.checked === true;
                return {
                  ...item,
                  checked: isOk,
                  notes: isOk ? '' : (existingItem?.note || existingItem?.notes || ''),
                };
              })
            );
          } else {
            setChecklist(defaultChecklist);
          }
        } else {
          setChecklist(defaultChecklist);
        }
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể tải thông tin phiên.';
      Alert.alert('Lỗi', message);
    } finally {
      setLoading(false);
    }
  }, [sessionId, type]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const requestImagePermission = async (source: 'camera' | 'library') => {
    if (source === 'camera') {
      const result = await ImagePicker.requestCameraPermissionsAsync();
      return result.granted;
    }
    const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return result.granted;
  };

  // Upload rental photos
  const handlePickRentalPhotos = async (source: 'camera' | 'library') => {
    const remaining = MAX_RENTAL_INSPECTION_PHOTOS - rentalPhotos.length;
    if (remaining <= 0) {
      Alert.alert(
        'Đã đạt giới hạn',
        `Mỗi biên bản chỉ nhận tối đa ${MAX_RENTAL_INSPECTION_PHOTOS} ảnh.`
      );
      return;
    }

    const granted = await requestImagePermission(source);
    if (!granted) {
      Alert.alert(
        'Thiếu quyền truy cập',
        source === 'camera'
          ? 'Vui lòng cấp quyền Camera để chụp ảnh kiểm xe.'
          : 'Vui lòng cấp quyền Thư viện ảnh để chọn ảnh kiểm xe.'
      );
      return;
    }

    try {
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.55,
              allowsEditing: false,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.55,
              allowsEditing: false,
              allowsMultipleSelection: true,
              selectionLimit: remaining,
            });

      if (result.canceled || !result.assets?.length) return;

      const assetsToUpload = result.assets.slice(0, remaining);
      setIsUploadingRentalPhotos(true);

      const newPhotos: RentalPhotoItem[] = assetsToUpload.map((asset, idx) => ({
        id: `photo_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        uri: asset.uri,
        url: '',
        notes: '',
        uploading: true,
      }));

      setRentalPhotos((prev) => [...prev, ...newPhotos]);

      await Promise.all(
        assetsToUpload.map(async (asset, idx) => {
          const itemKey = newPhotos[idx].id;
          try {
            const optimized = await optimizeInspectionImage(asset);
            const uploaded = await uploadImage(optimized.uri, 'inspection-photo', {
              fileName: `inspection-${itemKey}.jpg`,
              mimeType: 'image/jpeg',
              timeoutMs: INSPECTION_UPLOAD_TIMEOUT_MS,
            });

            setRentalPhotos((prev) =>
              prev.map((p) =>
                p.id === itemKey
                  ? { ...p, uri: optimized.uri, url: uploaded.url, uploading: false }
                  : p
              )
            );
          } catch (err) {
            setRentalPhotos((prev) => prev.filter((p) => p.id !== itemKey));
            throw err;
          }
        })
      );
    } catch (error: any) {
      const msg = getInspectionUploadErrorMessage(error);
      Alert.alert('Lỗi tải ảnh', msg);
    } finally {
      setIsUploadingRentalPhotos(false);
    }
  };

  // Upload BYOC photo for a specific participant
  const handlePickByocPhoto = async (index: number, source: 'camera' | 'library') => {
    const granted = await requestImagePermission(source);
    if (!granted) {
      Alert.alert(
        'Thiếu quyền truy cập',
        source === 'camera'
          ? 'Vui lòng cấp quyền Camera để chụp ảnh xe khách.'
          : 'Vui lòng cấp quyền Thư viện ảnh để chọn ảnh xe khách.'
      );
      return;
    }

    try {
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.55,
              allowsEditing: false,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.55,
              allowsEditing: false,
              allowsMultipleSelection: false,
            });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setByocPhotos((prev) =>
        prev.map((p, i) => (i === index ? { ...p, uri: asset.uri, uploading: true } : p))
      );

      const optimized = await optimizeInspectionImage(asset);
      const uploaded = await uploadImage(optimized.uri, 'inspection-photo', {
        fileName: `byoc-${Date.now()}-${index}.jpg`,
        mimeType: 'image/jpeg',
        timeoutMs: INSPECTION_UPLOAD_TIMEOUT_MS,
      });

      setByocPhotos((prev) =>
        prev.map((p, i) =>
          i === index ? { ...p, uri: optimized.uri, url: uploaded.url, uploading: false } : p
        )
      );
    } catch (error: any) {
      setByocPhotos((prev) =>
        prev.map((p, i) => (i === index ? { ...p, uploading: false } : p))
      );
      const msg = getInspectionUploadErrorMessage(error);
      Alert.alert('Lỗi tải ảnh', msg);
    }
  };

  const toggleChecklistItem = (id: string) => {
    const item = checklist.find((i) => i.id === id);
    if (!item) return;
    const nextChecked = !item.checked;

    const newChecklist = checklist.map((i) =>
      i.id === id ? { ...i, checked: nextChecked, notes: nextChecked ? '' : i.notes } : i
    );
    setChecklist(newChecklist);

    if (type === 'CHECK_OUT' && item.partType) {
      if (!nextChecked) {
        setDamageFlagged(true);
        setDamageLineItems((prev) => {
          if (prev.some((d) => d.partType === item.partType)) return prev;
          return [
            ...prev,
            { partType: item.partType as any, partsPrice: 0, laborPrice: 0 },
          ];
        });
      } else {
        setDamageLineItems((prev) => {
          const next = prev.filter((d) => d.partType !== item.partType);
          const allOk = newChecklist.every((i) => i.checked);
          if (next.length === 0 && allOk) {
            setDamageFlagged(false);
          }
          return next;
        });
      }
    }
  };

  const handleChecklistNotes = (id: string, notes: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, notes } : item))
    );
  };

  const addDamageItem = () => {
    setDamageFlagged(true);
    setDamageLineItems((prev) => [
      ...prev,
      { partType: 'OTHER', customPartName: '', partsPrice: 0, laborPrice: 0 },
    ]);
  };

  const removeDamageItem = (index: number) => {
    const itemToRemove = damageLineItems[index];
    const nextDamageItems = damageLineItems.filter((_, i) => i !== index);
    setDamageLineItems(nextDamageItems);

    if (itemToRemove?.partType) {
      const hasOtherSamePart = nextDamageItems.some(
        (d) => d.partType === itemToRemove.partType
      );
      if (!hasOtherSamePart) {
        setChecklist((prev) =>
          prev.map((item) =>
            item.partType === itemToRemove.partType
              ? { ...item, checked: true, notes: '' }
              : item
          )
        );
      }
    }

    const allOk = checklist.every((item) => item.checked);
    if (nextDamageItems.length === 0 && allOk) {
      setDamageFlagged(false);
    }
  };

  const updateDamageItem = (
    index: number,
    field: keyof DamageLineItemInput,
    value: string | number
  ) => {
    setDamageLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  // Close session directly for BYOC CHECK_OUT (Identical to Web)
  const handleCloseByocSession = async () => {
    setIsClosingByoc(true);
    try {
      await staffApi.simulateClientCheckOut(sessionId);
      Alert.alert('Thành công', 'Đã đóng phiên chơi xe tự mang thành công.');
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(`/staff/session/${sessionId}` as any);
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Không thể đóng phiên chơi.';
      Alert.alert('Lỗi', msg);
    } finally {
      setIsClosingByoc(false);
    }
  };

  // Form validation
  const validate = () => {
    if (isByoc) {
      const missing = byocPhotos.filter((p) => !p.url);
      if (missing.length > 0) {
        Alert.alert(
          'Thiếu ảnh xe khách',
          `Vui lòng chụp ảnh xác nhận xe cho: ${missing.map((p) => p.participantName).join(', ')}`
        );
        return false;
      }
    } else {
      if (rentalPhotos.length < MIN_RENTAL_INSPECTION_PHOTOS) {
        Alert.alert(
          'Thiếu ảnh kiểm xe',
          `Vui lòng thêm tối thiểu ${MIN_RENTAL_INSPECTION_PHOTOS} ảnh thực tế của xe để lập biên bản.`
        );
        return false;
      }
      if (rentalPhotos.some((p) => p.uploading)) {
        Alert.alert('Đang tải ảnh', 'Vui lòng chờ ảnh tải lên hoàn tất trước khi lưu biên bản.');
        return false;
      }
      if (damageFlagged && damageLineItems.length === 0) {
        Alert.alert('Thiếu hạng mục hư hỏng', 'Vui lòng thêm ít nhất một hạng mục hư hỏng.');
        return false;
      }
      if (
        damageFlagged &&
        damageLineItems.some((item) => item.partType === 'OTHER' && !item.customPartName?.trim())
      ) {
        Alert.alert('Thiếu tên hư hỏng', 'Vui lòng nhập tên hư hỏng cho mục “Khác”.');
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (isByoc) {
        const directions = ['FRONT', 'BACK', 'LEFT', 'RIGHT'] as const;
        await staffApi.submitInspection(sessionId, {
          type,
          photos: byocPhotos.map((p, i) => ({
            angle: directions[i % directions.length],
            url: p.url,
            notes: p.notes || `Xe của ${p.participantName}`,
          })),
          checklist: checklist.map((item) => ({
            itemKey: item.id,
            itemLabel: item.label,
            status: item.checked ? 'OK' : 'BROKEN',
            note: item.checked ? '' : (item.notes || '').trim(),
          })),
          staffNotes: staffNotes.trim(),
          damageFlagged: false,
        });
      } else {
        const photosArray = rentalPhotos.map((photo) => ({
          angle: 'OTHER',
          url: photo.url,
          notes: photo.notes || undefined,
        }));

        await staffApi.submitInspection(sessionId, {
          type,
          photos: photosArray,
          checklist: checklist.map((item) => ({
            itemKey: item.id,
            itemLabel: item.label,
            status: item.checked ? 'OK' : 'BROKEN',
            note: item.checked ? '' : (item.notes || '').trim(),
          })),
          staffNotes: staffNotes.trim(),
          damageFlagged: type === 'CHECK_OUT' && damageFlagged,
          damageLineItems:
            type === 'CHECK_OUT' && damageFlagged ? damageLineItems : undefined,
        });
      }

      Alert.alert(
        'Thành công',
        isCheckIn
          ? 'Biên bản nhận xe đã được lưu và phiên chuyển sang trạng thái đang chơi.'
          : 'Biên bản trả xe đã được lưu thành công. Bạn có thể tiến hành quyết toán và hoàn tất phiên chơi tại quầy.'
      );
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(`/staff/session/${sessionId}` as any);
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể lưu biên bản kiểm định.';
      Alert.alert('Lỗi', message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#f8fafc] dark:bg-[#0b0f19]">
        <ActivityIndicator size="large" color="#f97316" />
        <Text className="mt-3 text-[12px] text-slate-500">Đang tải thông tin kiểm xe...</Text>
      </SafeAreaView>
    );
  }

  // BYOC check-out: matching FE Web layout directly
  if (isByoc && type === 'CHECK_OUT') {
    return (
      <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'bottom']}>
        <View className="flex-1 items-center justify-center px-6">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10">
            <Info color="#3b82f6" size={32} />
          </View>
          <Text className="text-center text-[18px] text-slate-900 dark:text-white" weight="700">
            Không cần kiểm tra trả xe
          </Text>
          <Text className="mt-2 text-center text-[12px] leading-5 text-slate-500 dark:text-slate-400">
            Chế độ mang xe riêng — khách tự chịu trách nhiệm với xe của họ, không cần biên bản trả xe.
          </Text>

          <View className="mt-8 w-full max-w-xs gap-3">
            <Pressable
              disabled={isClosingByoc}
              onPress={handleCloseByocSession}
              className={`h-12 flex-row items-center justify-center gap-2 rounded-xl bg-[#ea580c] ${
                isClosingByoc ? 'opacity-70' : ''
              }`}
            >
              {isClosingByoc ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <CheckCircle2 color="#ffffff" size={18} />
              )}
              <Text className="text-[13px] text-white" weight="700">
                {isClosingByoc ? 'Đang đóng phiên...' : 'Đóng phiên chơi'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.back()}
              className="h-12 flex-row items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]"
            >
              <ChevronLeft color="#94a3b8" size={18} />
              <Text className="text-[13px] text-slate-700 dark:text-slate-200" weight="700">
                Quay lại phiên chạy
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const pageTitle =
    type === 'CHECK_IN'
      ? isByoc
        ? 'Xác nhận xe tự mang'
        : 'Lập biên bản bàn giao'
      : 'Lập biên bản trả xe';

  return (
    <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header matching FE */}
        <View className="flex-row items-center gap-3 border-b border-slate-200 dark:border-slate-900 bg-white dark:bg-[#0b0f19] px-5 py-3.5 shadow-sm">
          <Pressable
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]"
          >
            <ChevronLeft color="#94a3b8" size={20} />
          </Pressable>
          <View className="flex-1">
            <Text className="font-mono text-[11px] font-bold text-slate-500">
              Phiên chạy: {sessionId.slice(0, 8).toUpperCase()}
            </Text>
            <Text className="text-[17px] text-slate-900 dark:text-white" weight="700">
              {pageTitle}
            </Text>
            {isByoc ? (
              <View className="mt-1 self-start rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5">
                <Text className="text-[9px] uppercase text-blue-700 dark:text-blue-300" weight="700">
                  Chế độ mang xe riêng
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <ScrollView contentContainerClassName="px-4 py-4 pb-28" showsVerticalScrollIndicator={false}>
          {/* PHOTO SECTION */}
          <View className="mb-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1 flex-row items-center gap-2">
                <Camera color="#ea580c" size={18} />
                <Text className="text-[13px] uppercase tracking-wider text-slate-900 dark:text-white" weight="700">
                  {isByoc
                    ? `Ảnh xác nhận xe khách (${byocPhotos.length} người — bắt buộc)`
                    : `Ảnh bàn giao xe (${rentalPhotos.length}/${MAX_RENTAL_INSPECTION_PHOTOS})`}
                </Text>
              </View>
              {!isByoc && type === 'CHECK_OUT' && checkInInspection?.photos?.length ? (
                <Pressable
                  onPress={() => setShowCheckInBaselines(!showCheckInBaselines)}
                  className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 py-1.5"
                >
                  <Text className="text-[10px] text-[#ea580c]" weight="700">
                    {showCheckInBaselines ? 'Ẩn ảnh nhận gốc' : 'So sánh ảnh nhận gốc'}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {isByoc ? (
              /* BYOC Photo Slots: 1 slot per participant */
              <View className="mt-3 gap-3">
                {byocPhotos.map((slot, index) => (
                  <View
                    key={index}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3"
                  >
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-[12px] text-slate-900 dark:text-white" weight="700">
                        {slot.participantName}
                      </Text>
                      {slot.url ? (
                        <View className="rounded bg-emerald-500/10 px-1.5 py-0.5">
                          <Text className="text-[9px] text-emerald-400" weight="700">
                            ✓ Đã chụp
                          </Text>
                        </View>
                      ) : (
                        <View className="rounded bg-rose-500/10 px-1.5 py-0.5">
                          <Text className="text-[9px] text-rose-400" weight="700">
                            Bắt buộc
                          </Text>
                        </View>
                      )}
                    </View>

                    <View className="aspect-video w-full overflow-hidden rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0f172a]">
                      {slot.url || slot.uri ? (
                        <Pressable
                          onPress={() => {
                            if (slot.url || slot.uri) {
                              setPreviewPhoto({
                                url: slot.url || slot.uri || '',
                                title: `Xe tự mang của ${slot.participantName}`,
                              });
                            }
                          }}
                          className="h-full w-full"
                        >
                          <Image
                            source={{ uri: slot.url || slot.uri }}
                            className="h-full w-full"
                            resizeMode="cover"
                          />
                          {slot.uploading ? (
                            <View className="absolute inset-0 items-center justify-center bg-black/60">
                              <ActivityIndicator color="#ffffff" />
                              <Text className="mt-1 text-[10px] text-white">Đang tải...</Text>
                            </View>
                          ) : null}
                        </Pressable>
                      ) : (
                        <View className="h-full w-full items-center justify-center gap-1.5">
                          <Camera color="#64748b" size={24} />
                          <Text className="text-[11px] text-[#ea580c]" weight="700">
                            + Chụp ảnh xe
                          </Text>
                          <Text className="text-[9px] text-slate-400">
                            Toàn cảnh xe để xác nhận
                          </Text>
                        </View>
                      )}
                    </View>

                    <View className="mt-2.5 flex-row gap-2">
                      <Pressable
                        disabled={slot.uploading}
                        onPress={() => handlePickByocPhoto(index, 'camera')}
                        className="h-9 flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10"
                      >
                        <Camera color="#ea580c" size={14} />
                        <Text className="text-[11px] text-[#ea580c]" weight="700">
                          {slot.url ? 'Chụp lại' : 'Chụp ảnh'}
                        </Text>
                      </Pressable>
                      <Pressable
                        disabled={slot.uploading}
                        onPress={() => handlePickByocPhoto(index, 'library')}
                        className="h-9 flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]"
                      >
                        <UploadCloud color="#94a3b8" size={14} />
                        <Text className="text-[11px] text-slate-700 dark:text-slate-200" weight="700">
                          Chọn từ máy
                        </Text>
                      </Pressable>
                    </View>

                    {slot.url ? (
                      <TextInput
                        value={slot.notes}
                        onChangeText={(notes) =>
                          setByocPhotos((prev) =>
                            prev.map((p, i) => (i === index ? { ...p, notes } : p))
                          )
                        }
                        placeholder="Màu, đặc điểm xe..."
                        placeholderTextColor="#64748b"
                        className="mt-2 h-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b0f19] px-2.5 text-[11px] text-slate-900 dark:text-white"
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              /* RENTAL Photos Section */
              <View className="mt-3 space-y-3">
                <View className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                  <Text className="text-[11px] leading-5 text-amber-700 dark:text-amber-200/90">
                    Cần tối thiểu {MIN_RENTAL_INSPECTION_PHOTOS} và tối đa {MAX_RENTAL_INSPECTION_PHOTOS} ảnh. Hãy chụp tổng thể xe, phía trước, phía sau, hai bên và cận cảnh mọi vết xước hoặc hư hỏng hiện có để đối chiếu khi trả xe.
                  </Text>
                </View>

                {rentalPhotos.length < MAX_RENTAL_INSPECTION_PHOTOS ? (
                  <View className="flex-row gap-2">
                    <Pressable
                      disabled={isUploadingRentalPhotos}
                      onPress={() => handlePickRentalPhotos('camera')}
                      className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-orange-500/50 bg-orange-500/10"
                    >
                      <Camera color="#ea580c" size={16} />
                      <Text className="text-[12px] text-[#ea580c]" weight="700">
                        Chụp ảnh
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={isUploadingRentalPhotos}
                      onPress={() => handlePickRentalPhotos('library')}
                      className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50"
                    >
                      <ImagePlus color="#94a3b8" size={16} />
                      <Text className="text-[12px] text-slate-700 dark:text-slate-200" weight="700">
                        Chọn nhiều ảnh
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {isUploadingRentalPhotos ? (
                  <View className="flex-row items-center justify-center gap-2 py-2">
                    <ActivityIndicator color="#ea580c" size="small" />
                    <Text className="text-[11px] text-slate-500">Đang nén & tải ảnh lên...</Text>
                  </View>
                ) : null}

                {remainingRentalPhotos > 0 && rentalPhotos.length > 0 ? (
                  <Text className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                    Cần thêm {remainingRentalPhotos} ảnh để đủ điều kiện lưu biên bản.
                  </Text>
                ) : null}

                {rentalPhotos.length > 0 ? (
                  <View className="gap-3">
                    {rentalPhotos.map((photo, index) => (
                      <View
                        key={photo.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3"
                      >
                        <View className="mb-2 flex-row items-center justify-between">
                          <Text className="text-[11px] uppercase tracking-wider text-slate-500" weight="700">
                            Ảnh {index + 1}
                          </Text>
                          <Pressable
                            onPress={() =>
                              setRentalPhotos((prev) => prev.filter((item) => item.id !== photo.id))
                            }
                            className="h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10"
                          >
                            <Trash2 color="#ef4444" size={13} />
                          </Pressable>
                        </View>

                        <View className="aspect-video w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]">
                          <Pressable
                            onPress={() => {
                              const url = photo.url || photo.uri;
                              if (url) setPreviewPhoto({ url, title: `Ảnh bàn giao xe ${index + 1}` });
                            }}
                            className="h-full w-full"
                          >
                            <Image
                              source={{ uri: photo.url || photo.uri }}
                              className="h-full w-full"
                              resizeMode="cover"
                            />
                            {photo.uploading ? (
                              <View className="absolute inset-0 items-center justify-center bg-black/60">
                                <ActivityIndicator color="#ffffff" />
                              </View>
                            ) : null}
                          </Pressable>
                        </View>

                        <TextInput
                          value={photo.notes}
                          onChangeText={(notes) =>
                            setRentalPhotos((prev) =>
                              prev.map((item) => (item.id === photo.id ? { ...item, notes } : item))
                            )
                          }
                          placeholder="Ghi chú tùy chọn, ví dụ: vết xước cản trước"
                          placeholderTextColor="#64748b"
                          className="mt-2.5 h-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b0f19] px-2.5 text-[11px] text-slate-900 dark:text-white"
                        />
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Show Baseline Photos Comparison */}
                {showCheckInBaselines && checkInInspection?.photos?.length ? (
                  <View className="mt-3 border-t border-slate-200 dark:border-slate-800 pt-3">
                    <Text className="mb-2 text-[11px] uppercase tracking-wider text-blue-500 dark:text-blue-400" weight="700">
                      Ảnh bàn giao lúc nhận xe
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View className="flex-row gap-2">
                        {checkInInspection.photos.map((photo, index) => (
                          <Pressable
                            key={index}
                            onPress={() =>
                              setPreviewPhoto({
                                url: photo.url,
                                title: `Ảnh nhận xe gốc ${index + 1}`,
                              })
                            }
                            className="h-24 w-32 overflow-hidden rounded-xl border border-blue-500/30 bg-blue-500/5"
                          >
                            <Image source={{ uri: photo.url }} className="h-full w-full" resizeMode="cover" />
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          {/* CHECKLIST SECTION */}
          <View className="mb-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm">
            <View className="mb-3 flex-row items-center gap-2">
              <ShieldCheck color="#ea580c" size={18} />
              <Text className="text-[13px] uppercase tracking-wider text-slate-900 dark:text-white" weight="700">
                {isByoc
                  ? 'Xác nhận điều kiện tham gia'
                  : type === 'CHECK_OUT'
                  ? 'Xác nhận đã kiểm tra linh kiện'
                  : 'Danh mục kiểm tra an toàn linh kiện'}
              </Text>
            </View>

            <View className="gap-3">
              {checklist.map((item) => (
                <View
                  key={item.id}
                  className={`rounded-xl border p-3 ${
                    item.checked
                      ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/60'
                      : 'border-rose-500/30 bg-rose-500/10'
                  }`}
                >
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-1">
                      <Text
                        className={`text-[12px] leading-5 ${
                          item.checked
                            ? 'text-slate-900 dark:text-white'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                        weight="700"
                      >
                        {item.label}
                      </Text>
                    </View>
                    <Switch
                      value={item.checked}
                      onValueChange={() => toggleChecklistItem(item.id)}
                      trackColor={{ false: '#991b1b', true: '#ea580c' }}
                      thumbColor="#ffffff"
                    />
                  </View>

                  {!item.checked ? (
                    <TextInput
                      value={item.notes || ''}
                      onChangeText={(notes) => handleChecklistNotes(item.id, notes)}
                      placeholder="Ghi chú thêm lý do không đạt..."
                      placeholderTextColor="#64748b"
                      className="mt-2 h-9 rounded-lg border border-rose-500/30 bg-white dark:bg-[#0b0f19] px-2.5 text-[11px] text-rose-800 dark:text-rose-200"
                    />
                  ) : null}
                </View>
              ))}
            </View>
          </View>

          {/* DAMAGE LINE ITEMS (RENTAL CHECK_OUT ONLY) */}
          {!isByoc && type === 'CHECK_OUT' ? (
            <View className="mb-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm">
              <View className="mb-3 flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-[13px] text-slate-900 dark:text-white" weight="700">
                    Phát hiện hư hỏng do va chạm
                  </Text>
                  <Text className="mt-1 text-[11px] leading-4 text-slate-500">
                    Yêu cầu bồi thường sửa chữa linh kiện xe
                  </Text>
                </View>
                <Switch
                  value={damageFlagged}
                  onValueChange={(enabled) => {
                    setDamageFlagged(enabled);
                    if (enabled && damageLineItems.length === 0) {
                      setDamageLineItems([{ partType: 'TIRE_WHEEL', partsPrice: 0, laborPrice: 0 }]);
                    } else if (!enabled) {
                      setDamageLineItems([]);
                    }
                  }}
                  trackColor={{ false: '#1e293b', true: '#ea580c' }}
                  thumbColor="#ffffff"
                />
              </View>

              {damageFlagged ? (
                <View className="mt-2 gap-3 border-t border-slate-200 dark:border-slate-800 pt-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[11px] uppercase tracking-wider text-slate-500" weight="700">
                      Danh sách hạng mục hư hỏng
                    </Text>
                    <Pressable
                      onPress={addDamageItem}
                      className="flex-row items-center gap-1 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 py-1"
                    >
                      <Plus color="#ea580c" size={13} />
                      <Text className="text-[10px] text-[#ea580c]" weight="700">
                        Thêm hạng mục
                      </Text>
                    </Pressable>
                  </View>

                  {damageLineItems.length === 0 ? (
                    <View className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center">
                      <Text className="text-center text-[11px] text-slate-500">
                        {'Chưa có hạng mục nào. Nhấn "Thêm hạng mục" để bắt đầu ghi nhận.'}
                      </Text>
                    </View>
                  ) : null}

                  {damageLineItems.map((item, index) => {
                    const lineTotal = Number(item.partsPrice || 0) + Number(item.laborPrice || 0);
                    return (
                      <View
                        key={index}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3"
                      >
                        <View className="mb-2 flex-row items-center justify-between">
                          <Text className="text-[11px] text-slate-900 dark:text-white" weight="700">
                            Hạng mục {index + 1}
                          </Text>
                          <Pressable
                            onPress={() => removeDamageItem(index)}
                            className="h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10"
                          >
                            <Trash2 color="#ef4444" size={13} />
                          </Pressable>
                        </View>

                        {/* Part Type Pills */}
                        <View className="mb-2 flex-row flex-wrap gap-1.5">
                          {(Object.keys(PART_TYPE_LABELS) as DamagePartType[]).map((pType) => {
                            const isSelected = item.partType === pType;
                            return (
                              <Pressable
                                key={pType}
                                onPress={() => updateDamageItem(index, 'partType', pType)}
                                className={`rounded-lg border px-2 py-1 ${
                                  isSelected
                                    ? 'border-orange-500 bg-orange-500/10'
                                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]'
                                }`}
                              >
                                <Text
                                  className={`text-[9px] ${
                                    isSelected ? 'text-[#ea580c]' : 'text-slate-500'
                                  }`}
                                  weight="700"
                                >
                                  {PART_TYPE_LABELS[pType]}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        {item.partType === 'OTHER' ? (
                          <TextInput
                            value={item.customPartName || ''}
                            onChangeText={(value) => updateDamageItem(index, 'customPartName', value)}
                            placeholder="Nhập tên hư hỏng cụ thể..."
                            placeholderTextColor="#64748b"
                            className="mb-2 h-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b0f19] px-2.5 text-[11px] text-slate-900 dark:text-white"
                          />
                        ) : null}

                        <View className="flex-row gap-2">
                          <View className="flex-1">
                            <Text className="mb-1 text-[9px] uppercase tracking-wider text-slate-500" weight="700">
                              Giá linh kiện (đ)
                            </Text>
                            <TextInput
                              value={item.partsPrice ? String(item.partsPrice) : ''}
                              onChangeText={(val) =>
                                updateDamageItem(index, 'partsPrice', Number(val.replace(/[^\d]/g, '') || 0))
                              }
                              keyboardType="number-pad"
                              placeholder="0"
                              placeholderTextColor="#64748b"
                              className="h-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b0f19] px-2.5 text-[11px] text-slate-900 dark:text-white"
                            />
                          </View>
                          <View className="flex-1">
                            <Text className="mb-1 text-[9px] uppercase tracking-wider text-slate-500" weight="700">
                              Phí công sửa (đ)
                            </Text>
                            <TextInput
                              value={item.laborPrice ? String(item.laborPrice) : ''}
                              onChangeText={(val) =>
                                updateDamageItem(index, 'laborPrice', Number(val.replace(/[^\d]/g, '') || 0))
                              }
                              keyboardType="number-pad"
                              placeholder="0"
                              placeholderTextColor="#64748b"
                              className="h-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b0f19] px-2.5 text-[11px] text-slate-900 dark:text-white"
                            />
                          </View>
                        </View>

                        <View className="mt-2 flex-row justify-end">
                          <Text className="text-[10px] text-slate-500">
                            Dòng này: <Text className="font-bold text-slate-900 dark:text-white">{formatCurrency(lineTotal)}</Text>
                          </Text>
                        </View>
                      </View>
                    );
                  })}

                  {damageLineItems.length > 0 ? (
                    <View className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3.5">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-[12px] text-rose-700 dark:text-rose-300" weight="700">
                          Tổng phí bồi thường:
                        </Text>
                        <Text className="text-[15px] text-rose-600 dark:text-rose-400" weight="700">
                          {formatCurrency(totalDamageCharge)}
                        </Text>
                      </View>
                      <Text className="mt-1.5 text-[10px] text-rose-600/80 dark:text-rose-300/80">
                        Khách hàng sẽ xem bảng kê chi tiết và xác nhận trước khi thanh toán.
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* STAFF NOTES SECTION */}
          <View className="mb-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm">
            <Text className="mb-2 text-[13px] uppercase tracking-wider text-slate-900 dark:text-white" weight="700">
              Ghi chú tổng quan biên bản
            </Text>
            <TextInput
              value={staffNotes}
              onChangeText={setStaffNotes}
              multiline
              placeholder={
                isByoc
                  ? 'Ghi chú về xe khách hoặc điều kiện đặc biệt...'
                  : 'Nhập nhận xét chung của kiểm định viên...'
              }
              placeholderTextColor="#64748b"
              className="min-h-[80px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b0f19] p-3 text-[12px] text-slate-900 dark:text-white"
              style={{ textAlignVertical: 'top' }}
            />
          </View>
        </ScrollView>

        {/* BOTTOM ACTION BAR */}
        <View className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b0f19] px-4 py-3 shadow-lg">
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => router.back()}
              className="h-12 w-24 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]"
            >
              <Text className="text-[13px] text-slate-700 dark:text-slate-300" weight="700">
                Hủy bỏ
              </Text>
            </Pressable>

            <Pressable
              disabled={
                submitting ||
                isUploadingRentalPhotos ||
                (!isByoc && remainingRentalPhotos > 0)
              }
              onPress={handleSubmit}
              className={`h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-[#ea580c] px-3 ${
                submitting || isUploadingRentalPhotos || (!isByoc && remainingRentalPhotos > 0)
                  ? 'opacity-60'
                  : ''
              }`}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <FileCheck color="#ffffff" size={17} />
              )}
              <Text
                numberOfLines={1}
                className="text-[13px] text-white"
                weight="700"
              >
                {submitting
                  ? 'Đang lưu...'
                  : isByoc
                  ? 'Xác nhận xe khách'
                  : remainingRentalPhotos > 0
                  ? `Cần thêm ${remainingRentalPhotos} ảnh`
                  : 'Lưu biên bản kiểm định'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <ImageZoomModal
        visible={!!previewPhoto}
        imageUrl={previewPhoto?.url}
        title={previewPhoto?.title}
        onClose={() => setPreviewPhoto(null)}
      />
    </SafeAreaView>
  );
}
