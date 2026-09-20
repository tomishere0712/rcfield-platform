# RCField Mobile Setup Guide

## Requirements

- Node.js
- npm
- Expo Go that supports Expo SDK 54
- iOS Simulator, Android Emulator, or a physical device with Expo Go

This project is pinned to Expo SDK 54 because the available Expo Go version on the target device supports SDK 54.

## Install Dependencies

```bash
cd rcfield-mobile
npm install
```

Verify Expo dependency compatibility:

```bash
npx expo install --check
```

Expected result:

```text
Dependencies are up to date
```

## Configure Environment

Create local `.env` from `.env.example` if needed:

```bash
cp .env.example .env
```

Local `.env`:

```env
EXPO_PUBLIC_API_URL=
EXPO_PUBLIC_ENV=development
```

If testing against a backend from a physical device, use the machine IP address instead of `localhost`.

Find the Mac Wi-Fi IP:

```bash
ipconfig getifaddr en0
```

Example:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.12:3000/api/v1
EXPO_PUBLIC_ENV=development
```

`EXPO_PUBLIC_API_URL` may stay empty while the app has no real API calls. The app will warn in development, but setup screens still run.

## Start the App

For Expo Go on a physical device in the same Wi-Fi network:

```bash
npx expo start --host lan --port 8082
```

Then scan the QR code in Expo Go.

For local web validation:

```bash
npx expo start --localhost --port 8082
```

If port `8082` is busy, choose another port:

```bash
npx expo start --host lan --port 8083
```

## Quality Checks

Run all checks:

```bash
npm run check
```

This runs:

```bash
npm run typecheck
npm run lint
npm test
```

Expected successful output includes:

```text
TypeScript passed: 0 type errors.
ESLint passed: 0 errors, 0 warnings.
Test Suites: 1 passed
```

## Pre-push Hook

The root repo uses a Git hook path:

```bash
git config core.hooksPath .githooks
```

The pre-push hook runs `npm --prefix rcfield-mobile run check` when pushed commits include mobile changes. If checks fail, Git blocks the push.

If this repo is freshly cloned and the hook does not run, enable it again from the root repo:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-push
```

## Troubleshooting

### Expo Go says the project requires a newer version

Check the installed Expo SDK:

```bash
node -p "require('expo/package.json').version"
```

This project should use Expo SDK 54:

```text
54.x.x
```

If dependencies drift, run:

```bash
npx expo install --check
```

Then align the packages reported by Expo.

### Physical device cannot reach backend

Do not use `localhost` in `.env` for physical device testing. Use the backend machine IP address:

```env
EXPO_PUBLIC_API_URL=http://<machine-ip>:3000/api/v1
```

Make sure the phone and machine are on the same network and the backend listens on a reachable host.

### `npm test` fails with WebStorage or Watchman errors

Use the existing script:

```bash
npm test
```

It runs through `scripts/run-jest.js`, which handles Node WebStorage compatibility. Jest config also disables Watchman for this project.
