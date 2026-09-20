import { Image, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Minus, Plus, X, ZoomIn } from 'lucide-react-native';
import { useEffect, useState } from 'react';

import { Text } from '@/shared/ui/Text';

type ImageZoomModalProps = {
  visible: boolean;
  imageUrl?: string | null;
  title?: string;
  onClose: () => void;
};

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const SCALE_STEP = 0.5;

/**
 * A shared, accessible image lightbox for vehicle handover evidence. The
 * controls work on both platforms; iOS users can additionally pinch to zoom.
 */
export function ImageZoomModal({
  visible,
  imageUrl,
  title = 'Ảnh kiểm xe',
  onClose,
}: ImageZoomModalProps) {
  const { width, height } = useWindowDimensions();
  const [scale, setScale] = useState(MIN_SCALE);

  useEffect(() => {
    if (visible) setScale(MIN_SCALE);
  }, [imageUrl, visible]);

  const changeScale = (direction: 1 | -1) => {
    setScale((current) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, current + direction * SCALE_STEP)));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black">
        <View className="absolute left-0 right-0 top-0 z-10 flex-row items-center justify-between px-5 pt-14">
          <View className="max-w-[75%] rounded-xl bg-black/70 px-3 py-2">
            <Text className="text-[12px] text-white" weight="700" numberOfLines={1}>
              {title}
            </Text>
            <Text className="mt-0.5 text-[10px] text-slate-300">Chụm hai ngón hoặc dùng nút +/- để phóng to</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng ảnh phóng to"
            onPress={onClose}
            className="h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/70"
          >
            <X color="#ffffff" size={21} />
          </Pressable>
        </View>

        {imageUrl ? (
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 96 }}
            maximumZoomScale={MAX_SCALE}
            minimumZoomScale={MIN_SCALE}
            pinchGestureEnabled
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <Image
              source={{ uri: imageUrl }}
              resizeMode="contain"
              style={{
                width: (width - 32) * scale,
                height: Math.max(240, height - 220) * scale,
              }}
            />
          </ScrollView>
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <ZoomIn color="#94a3b8" size={30} />
            <Text className="mt-3 text-center text-[13px] text-slate-300">Không thể tải ảnh kiểm xe này.</Text>
          </View>
        )}

        <View className="absolute bottom-10 left-0 right-0 flex-row items-center justify-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thu nhỏ ảnh"
            disabled={scale <= MIN_SCALE}
            onPress={() => changeScale(-1)}
            className={`h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/70 ${
              scale <= MIN_SCALE ? 'opacity-40' : ''
            }`}
          >
            <Minus color="#ffffff" size={20} />
          </Pressable>
          <View className="min-w-16 rounded-full border border-white/20 bg-black/70 px-4 py-3">
            <Text className="text-center text-[11px] text-white" weight="700">
              {Math.round(scale * 100)}%
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Phóng to ảnh"
            disabled={scale >= MAX_SCALE}
            onPress={() => changeScale(1)}
            className={`h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/70 ${
              scale >= MAX_SCALE ? 'opacity-40' : ''
            }`}
          >
            <Plus color="#ffffff" size={20} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
