# RCField Mobile

Mobile application foundation for RCField, built with Expo, React Native, Expo Router, and NativeWind.

This app is currently set up as a clean base project. Feature screens are intentionally minimal route shells; business UI and API flows should be implemented inside `src/features`.

## Tech Stack

- Expo SDK 54
- React Native 0.81
- Expo Router
- NativeWind v4
- React Query v5
- Zustand
- Axios
- React Hook Form
- Zod
- Expo SecureStore
- Lucide React Native
- Be Vietnam Pro
- Jest + React Native Testing Library
- ESLint + Prettier

## Project Structure

```text
rcfield-mobile/
├── app/                         Expo Router route shells
│   ├── (auth)/                  Auth route group
│   ├── (tabs)/                  Main tab route group
│   ├── _layout.tsx              Root provider wrapper
│   └── index.tsx                Redirect controller
├── src/
│   ├── features/                Feature screens and feature-specific code
│   └── shared/
│       ├── components/          Shared compound components
│       ├── config/              Environment/config layer
│       ├── constants/           API, query, storage keys
│       ├── lib/                 API client, query client, utilities
│       ├── providers/           App-level providers
│       ├── schemas/             Zod schemas
│       ├── store/               Zustand stores
│       ├── types/               Shared TypeScript types
│       └── ui/                  Reusable UI primitives
├── scripts/                     Local command wrappers
├── assets/                      Icons, splash assets, images
├── global.css                   NativeWind global stylesheet
├── tailwind.config.js           NativeWind/Tailwind config
├── metro.config.js              Metro + NativeWind config
└── babel.config.js              Expo, NativeWind, Reanimated config
```

## Routing Convention

Route files in `app/` should stay thin. They should read route params and render feature screens.

Example:

```tsx
// app/(tabs)/bookings.tsx
import { BookingListScreen } from '@/features/bookings/components/BookingListScreen';

export default function BookingsRoute() {
  return <BookingListScreen />;
}
```

Screen implementation belongs in `src/features`.

## Environment Variables

Local environment config lives in `.env`.

```env
EXPO_PUBLIC_API_URL=
EXPO_PUBLIC_ENV=development
```

For physical device testing, do not use `localhost` for the API URL. Use the machine IP address running the backend:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.100:3000/api/v1
EXPO_PUBLIC_ENV=development
```

Only put public client-safe values in `EXPO_PUBLIC_*`. These values are bundled into the app.

## Scripts

```bash
npm run start       # Start Expo
npm run android     # Start Expo and open Android target
npm run ios         # Start Expo and open iOS target
npm run web         # Start Expo web
npm run typecheck   # TypeScript validation
npm run lint        # ESLint validation, fails on warnings
npm test            # Jest test suite
npm run check       # Typecheck + lint + test
npm run format      # Prettier format
```

`lint` and `typecheck` print a success message when no issues are found.

## Testing Convention

Keep unit and component tests colocated with the source file:

```text
src/shared/lib/utils.ts
src/shared/lib/utils.test.ts

src/shared/ui/Text.tsx
src/shared/ui/Text.test.tsx

src/features/auth/components/LoginScreen.tsx
src/features/auth/components/LoginScreen.test.tsx
```

Use a separate top-level test folder only for wider-scope tests such as E2E or integration suites.

## Git Checks

The workspace has a pre-push hook at `../.githooks/pre-push`.

Before pushing mobile changes, Git runs:

```bash
npm --prefix rcfield-mobile run check
```

If typecheck, lint, or tests fail, the push is blocked.
