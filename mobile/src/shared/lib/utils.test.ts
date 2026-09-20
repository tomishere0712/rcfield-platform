import { describe, expect, it } from '@jest/globals';

import { cn } from './utils';

describe('cn', () => {
  it('merges conditional and conflicting Tailwind classes', () => {
    expect(cn('px-2', false && 'py-2', 'px-4')).toBe('px-4');
  });
});
