import React from 'react';
import { View, StyleSheet, type DimensionValue } from 'react-native';
import { Check, Compass, Users, Coffee, CreditCard } from 'lucide-react-native';
import { Text } from '@/shared/ui/Text';
import { useColorScheme } from 'nativewind';

interface StepperBarProps {
  currentStep: number; // 1 | 2 | 3 | 4
}

const STEPS = [
  { id: 1, label: 'Chọn sân', sub: 'Bước 1', Icon: Compass },
  { id: 2, label: 'Người & xe', sub: 'Bước 2', Icon: Users },
  { id: 3, label: 'F&B', sub: 'Bước 3', Icon: Coffee },
  { id: 4, label: 'Thanh toán', sub: 'Bước 4', Icon: CreditCard },
];

export function StepperBar({ currentStep }: StepperBarProps) {
  const { colorScheme } = useColorScheme();
  // Tính toán chiều rộng của đường màu cam active nối từ tâm vòng tròn 1 đến tâm vòng tròn 4
  const activeLineWidth = `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` as DimensionValue;

  return (
    <View className="w-full bg-white dark:bg-[#0f172a]/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 mb-5 shadow-sm">
      {/* Title */}
      <View className="mb-5">
        <Text className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
          RCField Checkout
        </Text>
        <Text className="text-[17px] text-slate-900 dark:text-white mt-0.5" weight="700">
          Hoàn tất đặt lịch chạy RC
        </Text>
      </View>

      {/* Stepper progress */}
      <View className="w-full relative">
        {/* Đường nối ngang chạy nền phía sau các vòng tròn */}
        <View style={[styles.lineBackground, { backgroundColor: colorScheme === 'dark' ? '#1e293b' : '#e2e8f0' }]}>
          <View style={[styles.lineActive, { width: activeLineWidth }]} />
        </View>

        {/* 4 Steps Block chia đều cột dọc, căn giữa đồng tâm */}
        <View className="flex-row justify-between w-full">
          {STEPS.map((step) => {
            const isCompleted = step.id < currentStep;
            const isActive = step.id === currentStep;
            const IconComponent = step.Icon;

            return (
              <View key={step.id} className="items-center" style={{ width: '23%' }}>
                {/* Node hình tròn (chèn lên trên đường line nền nhờ zIndex) */}
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.5,
                    backgroundColor: isCompleted ? '#ea580c' : (colorScheme === 'dark' ? '#0b0f19' : '#ffffff'),
                    borderColor: isCompleted ? '#ea580c' : isActive ? '#f97316' : (colorScheme === 'dark' ? '#334155' : '#cbd5e1'),
                    zIndex: 10,
                  }}
                  className="mb-2"
                >
                  {isCompleted ? (
                    <Check color="#ffffff" size={14} strokeWidth={3} />
                  ) : (
                    <IconComponent
                      color={isActive ? '#f97316' : (colorScheme === 'dark' ? '#475569' : '#94a3b8')}
                      size={15}
                      strokeWidth={isActive ? 2.5 : 2}
                    />
                  )}
                </View>

                {/* Nhãn chữ nằm chính giữa cột dọc của vòng tròn */}
                <Text
                  className={`text-[10px] text-center font-bold leading-4 ${
                    isActive ? 'text-[#f97316]' : 'text-slate-500 dark:text-slate-400'
                  }`}
                  numberOfLines={1}
                >
                  {step.label}
                </Text>
                <Text className="text-[7.5px] text-slate-500 font-semibold text-center mt-0.5">
                  {step.sub}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lineBackground: {
    position: 'absolute',
    top: 18, // Bằng 1/2 chiều cao vòng tròn (36px / 2) để nằm chính giữa
    left: '11.5%', // Bắt đầu tại tâm của cột thứ nhất (23% / 2)
    right: '11.5%', // Kết thúc tại tâm của cột thứ tư (23% / 2)
    height: 2,
    zIndex: 1,
  },
  lineActive: {
    height: '100%',
    backgroundColor: '#ea580c',
  },
});
