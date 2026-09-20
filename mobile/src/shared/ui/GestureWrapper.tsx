import React from 'react';
import { View, Platform, DeviceEventEmitter } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { router } from 'expo-router';

interface GestureWrapperProps {
  children: React.ReactNode;
}

export function GestureWrapper({ children }: GestureWrapperProps) {
  const gesture = Gesture.Pan()
    .runOnJS(true)
    .hitSlop({ left: 0, width: 32 })
    .activeOffsetX(20)
    .failOffsetY([-35, 35])
    .onEnd((event) => {
      const { translationX, translationY } = event;

      // Swipe Right to go back
      if (translationX > 65 && translationX > Math.abs(translationY) * 1.3) {
        try {
          if (router.canGoBack()) {
            DeviceEventEmitter.emit('WIZARD_SWIPE_BACK');
            router.back();
          }
        } catch {
          // Ignore if outside navigation context
        }
      }
    });

  // Chạy GestureDetector trên Mobile
  if (Platform.OS === 'web') {
    return <View style={{ flex: 1 }}>{children}</View>;
  }

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ flex: 1, backgroundColor: '#0b0b0b' }}>{children}</View>
    </GestureDetector>
  );
}
