import { forwardRef } from 'react';
import { Text as NativeText, type TextProps as NativeTextProps } from 'react-native';

import { cn } from '@/shared/lib/utils';

type TextVariant = 'body' | 'title' | 'subtitle' | 'caption';
type TextWeight = '400' | '500' | '600' | '700';

export interface TextProps extends NativeTextProps {
  className?: string;
  variant?: TextVariant;
  weight?: TextWeight;
}

const variantClassNames: Record<TextVariant, string> = {
  body: 'text-base leading-6 text-slate-900',
  title: 'text-2xl leading-8 text-slate-950',
  subtitle: 'text-lg leading-7 text-slate-900',
  caption: 'text-sm leading-5 text-slate-500',
};

const fontFamilyByWeight: Record<TextWeight, string> = {
  '400': 'BeVietnamPro_400Regular',
  '500': 'BeVietnamPro_500Medium',
  '600': 'BeVietnamPro_600SemiBold',
  '700': 'BeVietnamPro_700Bold',
};

export const Text = forwardRef<NativeText, TextProps>(function Text(
  { className, variant = 'body', weight = '400', style, maxFontSizeMultiplier = 1.25, ...props },
  ref,
) {
  return (
    <NativeText
      ref={ref}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      className={cn(variantClassNames[variant], className)}
      style={[{ fontFamily: fontFamilyByWeight[weight] }, style]}
      {...props}
    />
  );
});
