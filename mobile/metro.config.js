const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');
const fs = require('fs');

const config = getDefaultConfig(__dirname);

// Fix: whatwg-url-without-unicode relative imports fail under Metro's package exports resolution.
// The package mixes require styles: some with .js (e.g. "./URL-impl.js") and some without
// (e.g. "./infra", "./url-state-machine"). Metro with unstable_enablePackageExports (Expo 54)
// cannot resolve these. We intercept and resolve them manually.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Fix: util package requiring './support/isBuffer' without extension
  if (moduleName === './support/isBuffer' && context.originModulePath && context.originModulePath.includes('node_modules/util/')) {
    moduleName = './support/isBufferBrowser';
  }

  // Fix: whatwg-url-without-unicode relative imports that Metro can't resolve
  if (
    context.originModulePath &&
    context.originModulePath.includes('whatwg-url-without-unicode') &&
    moduleName.startsWith('./')
  ) {
    const dir = path.dirname(context.originModulePath);
    let resolved = path.resolve(dir, moduleName);

    // If the resolved path doesn't have .js extension, try adding it
    if (!path.extname(resolved)) {
      resolved += '.js';
    }

    if (fs.existsSync(resolved)) {
      return {
        type: 'sourceFile',
        filePath: resolved,
      };
    }
  }

  // Delegate to Metro's default resolver
  return context.resolveRequest(
    { ...context, resolveRequest: undefined },
    moduleName,
    platform,
  );
};

module.exports = withNativeWind(config, { input: './global.css' });
