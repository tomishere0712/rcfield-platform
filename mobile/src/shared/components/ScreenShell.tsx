import { type PropsWithChildren } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cn } from '@/shared/lib/utils';
import { Text } from '@/shared/ui/Text';

interface ScreenShellProps extends PropsWithChildren {
  className?: string;
  description?: string;
  title: string;
}

export function ScreenShell({ children, className, description, title }: ScreenShellProps) {
  return (
    <SafeAreaView className={cn('flex-1 bg-white', className)} edges={['top', 'left', 'right']}>
      <View className="flex-1 px-6 py-8">
        <Text variant="title" weight="700">
          {title}
        </Text>
        {description ? <Text className="mt-2 text-slate-600">{description}</Text> : null}
        {children}
      </View>
    </SafeAreaView>
  );
}
