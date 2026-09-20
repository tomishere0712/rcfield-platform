import { Pressable } from 'react-native';
import {
  renderComponent,
  UpgradeState,
} from '../../node_modules/react-native-css-interop/dist/runtime/native/render-component';

// This internal module is patched by patches/react-native-css-interop+0.2.5.patch.

describe('NativeWind css-interop warning serializer', () => {
  it('does not execute accessor properties while logging component props', () => {
    const navigationContext = {};
    Object.defineProperty(navigationContext, 'getKey', {
      enumerable: true,
      get() {
        throw new Error('Navigation context getter must not execute');
      },
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      expect(() =>
        renderComponent(
          Pressable,
          {
            canUpgradeWarn: true,
            pressable: UpgradeState.NONE,
            animated: UpgradeState.NONE,
            variables: UpgradeState.SHOULD_UPGRADE,
            containers: UpgradeState.NONE,
            originalProps: { navigationContext },
          } as unknown as Parameters<typeof renderComponent>[1],
          {},
          {},
          {},
          {}
        )
      ).not.toThrow();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"getKey": "[Getter]"'));
    } finally {
      logSpy.mockRestore();
    }
  });
});
