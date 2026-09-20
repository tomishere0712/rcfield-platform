# RCField Mobile 📱🏎️

> **Cross-Platform Mobile Application for RC Racers & On-Field Track Staff.**  
> Built with **React Native 0.81**, **Expo SDK 54**, **Expo Router v6**, **NativeWind v4**, and **TanStack Query v5**.

[![React Native](https://img.shields.io/badge/React_Native-0.81-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-SDK_54-000020?style=flat-square&logo=expo&logoColor=white)](https://expo.dev/)
[![Expo Router](https://img.shields.io/badge/Expo_Router-v6-black?style=flat-square&logo=expo&logoColor=white)](https://docs.expo.dev/router/introduction/)
[![NativeWind](https://img.shields.io/badge/Tailwind-NativeWind_v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://www.nativewind.dev/)
[![TanStack Query](https://img.shields.io/badge/TanStack_Query-v5-FF4154?style=flat-square&logo=react-query&logoColor=white)](https://tanstack.com/query)
[![Zustand](https://img.shields.io/badge/State-Zustand-orange?style=flat-square)](https://github.com/pmndrs/zustand)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Zod](https://img.shields.io/badge/Validation-Zod-3E67B1?style=flat-square&logo=zod&logoColor=white)](https://zod.dev/)
[![Jest](https://img.shields.io/badge/Testing-Jest-C21325?style=flat-square&logo=jest&logoColor=white)](https://jestjs.io/)

---

## 📌 Overview

**RCField Mobile** is a high-performance cross-platform application tailored for the RC (Remote Control) hobbyist and track racing ecosystem. Engineered for both iOS and Android, the app addresses two mission-critical user personas with dedicated, tailored interfaces:

1. **RC Racers (Customers)**: On-the-go track exploration, real-time slot availability, multi-vehicle rental bookings, tournament registrations, BYOC (Bring Your Own Car) digital garage management, and a live session countdown HUD.
2. **Track Staff (On-Field Operations)**: Fast-paced pit counter operations, instant QR ticket check-ins via camera, and mandatory 4-angle digital photo inspections at vehicle handover and return.

---

## 🌟 Key Technical Highlights (Mobile Architecture)

### 1. ⚡ Modern Framework & Routing
- **React Native 0.81 & Expo SDK 54**: Pinned to the latest stable Expo runtime with modern architecture support, Hermes JavaScript engine, and optimized bridge-less performance.
- **Expo Router v6**: File-based nested routing (`app/`), supporting typed route params, modal presentation screens, stack navigators, bottom tab bars, and seamless deep link handling.

### 2. 🎨 NativeWind v4 & Design System
- **Utility-First Styling**: Built on **NativeWind v4** (Tailwind CSS for React Native), compiling styles ahead-of-time into native StyleSheet objects for zero runtime overhead.
- **Brand Typography**: Integrated `@expo-google-fonts/be-vietnam-pro` for a refined, modern typography hierarchy across all screen densities.
- **Fluid Micro-Interactions**: Smooth 60fps gesture-driven animations powered by **React Native Reanimated** and **React Native Gesture Handler**.
- **Iconography**: Scalable, lightweight vector icons powered by `lucide-react-native`.

### 3. 📷 Hardware & Device Integrations
- **Camera Barcode Scanner (`expo-camera`)**: Sub-second ticket scanning at the counter, instantly resolving booking codes and verifying racer check-in status.
- **Digital Photo Handover (`expo-image-picker` & `expo-image-manipulator`)**: 4-angle vehicle condition capture (Front, Rear, Left/Right, Electronics/Chassis) with client-side image resizing and compression before upload to Cloudinary.
- **Geolocation & Interactive Maps (`expo-location` & `react-native-maps`)**: Live device location retrieval, dynamic distance calculations to nearby tracks, and full-screen interactive venue exploration.
- **Hardware-Backed Secure Storage (`expo-secure-store`)**: Securely stores JWT access and refresh tokens in iOS Keychain and Android Keystore with biometric encryption readiness.
- **Deep Linking (`expo-linking`)**: Handles URL scheme callbacks (`rcfield://payment-return`) for banking apps and VietQR payment confirmation redirects.
- **Push & Local Notifications (`expo-notifications`)**: Timely alerts for session countdown warnings, slot extension requests, and inspection confirmation reviews.

### 4. 🔄 State Management & Offline Resilience
- **Server State (TanStack Query v5)**: Intelligent caching, automatic background refetching, optimistic UI updates for booking actions, and focus-aware query invalidation (`useRefreshOnFocus`).
- **Client State (Zustand)**: Lightweight, persistent stores managing authentication state, active session timers, user preferences, and notification counters without unnecessary re-renders.
- **Strict Validation (React Hook Form + Zod)**: Robust client-side validation for login, profile editing, BYOC car registration, and booking options with instant inline error feedback.

---

## 🧭 11 Feature Modules & Architecture

The mobile application follows a **Domain-Driven Feature-Based Architecture**, cleanly isolating business logic, state, and UI within `src/features/`:

```text
mobile/src/features/
├── auth/           # Login, registration, password reset, JWT token lifecycle
├── bookings/       # Booking history, active session HUD, extension response modal
├── contests/       # Tournament catalog, racer registration, brackets & heats
├── explore/        # Track search, surface filter (Drift/Carpet/Clay), distance sorting
├── favorites/      # Bookmarked tracks with local cache synchronization
├── home/           # Dashboard: active session card, upcoming slots, quick actions
├── notifications/  # Notification center, push notification token registration
├── packages/       # Prepaid driving packages, slot balance tracking
├── profile/        # Racer profile, BYOC vehicle garage, account settings
├── reviews/        # Post-session star ratings, feedback tags, review submissions
└── staff/          # Staff portal: Camera QR ticket scanner & vehicle handover flow
```

---

## 📱 Dual User Experiences & Screen Flows

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        RCField Mobile App                              │
├───────────────────────────────────┬────────────────────────────────────┤
│       Racer (Customer) Flows      │       Staff On-Field Flows         │
├───────────────────────────────────┼────────────────────────────────────┤
│ • Interactive Track Explorer      │ • Sub-second Camera QR Scanner     │
│ • Surface & Spec Filters          │ • Ticket Check-in Validation       │
│ • Multi-Step Booking Wizard       │ • 4-Angle Photo Inspection Capture │
│ • Dual Mode: RENTAL & BYOC        │ • Vehicle Handover Checklist       │
│ • VietQR & Deep Link Payment      │ • Damage Flagging & Itemized Parts │
│ • Live Active Session Countdown   │ • On-Field Vehicle Status Control  │
│ • In-Session Extension Approvals  │ • Incident & Handover Review       │
│ • Tournament Registration         │                                    │
│ • Digital BYOC Vehicle Garage     │                                    │
└───────────────────────────────────┴────────────────────────────────────┘
```

### 🏎️ 1. Racer (Customer) Journey
1. **Discover**: Browse nearby RC venues on an interactive map or filter by surface type (Drift, Carpet, Offroad Clay).
2. **Book & Customize**: Choose a venue, pick time slots, select rental vehicles with tiered specs (Standard, Premium, Restricted) or register a personal BYOC car.
3. **Pay & Confirm**: Generate VietQR with embedded transaction reference codes (`RCFxxxxx`) or pay via online gateways, with automated deep-linking returns.
4. **Live Play Session**: Monitor the remaining session time via a live countdown HUD on the home screen, approve or reject staff-proposed extensions, and review checkout receipts.

### 🏁 2. Track Staff Journey
1. **Instant Check-in**: Point the device camera at the customer's QR ticket; `expo-camera` immediately scans and resolves the booking.
2. **Inspection Handover**: Capture 4 photos of the vehicle condition and complete the hardware safety checklist before releasing the transmitter.
3. **Return & Settle**: At checkout, capture return photos, cross-reference pre-existing marks, and record any itemized damage charges without disputes.

---

## 📂 Project Structure

```text
mobile/
├── app/                         # Expo Router (File-based navigation)
│   ├── (auth)/                  # Auth group: login, register, forgot-password
│   ├── (tabs)/                  # Bottom tab bar: explore, bookings, contests, profile
│   │   ├── explore.tsx          # Venue discovery list & search
│   │   ├── bookings.tsx         # My bookings (Upcoming, Active, Completed)
│   │   ├── contests.tsx         # Tournaments & race events
│   │   └── profile.tsx          # Racer profile & BYOC garage
│   ├── booking/                 # Booking wizard screens (slots, vehicles, review, pay)
│   ├── cafe-detail/             # Track profile, track specs, rental fleet, reviews
│   ├── customer/                # Customer sub-routes (BYOC vehicle management, packages)
│   ├── staff/                   # Staff operations: QR camera scanner & inspection wizard
│   ├── explore-map.tsx          # Full-screen interactive map view
│   ├── favorites.tsx            # Bookmarked venues
│   ├── notifications.tsx        # Push notification history
│   ├── payment-return.tsx       # Deep link handler for banking returns
│   ├── _layout.tsx              # Root layout with QueryClient, Auth, and Theme providers
│   └── index.tsx                # App entry routing controller
├── src/
│   ├── features/                # 11 Domain feature implementations
│   ├── shared/                  # Shared primitives, hooks, stores & UI kit
│   │   ├── components/          # Reusable domain components (TrackCard, SessionTimer)
│   │   ├── config/              # Environment config & API endpoints
│   │   ├── hooks/               # Custom hooks (useLocation, useCamera, useDebounce)
│   │   ├── lib/                 # Axios HTTP client with JWT interceptors, secure storage
│   │   ├── providers/           # App-level React context providers
│   │   ├── schemas/             # Zod validation schemas
│   │   ├── store/               # Zustand global stores (auth, settings)
│   │   ├── types/               # TypeScript models & navigation types
│   │   └── ui/                  # Accessible UI primitives (Button, Input, Card, Badge, Modal)
│   └── __tests__/               # Jest unit and component test suites
├── assets/                      # App icons, splash screens, and raster assets
├── app.json                     # Expo configuration manifest
├── tailwind.config.js           # NativeWind / Tailwind CSS theme config
└── package.json                 # Pinned dependencies & development scripts
```

---

## 🛠️ Tech Stack & Dependencies Matrix

| Category | Package | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Core Framework** | `react-native` | `0.81.5` | Cross-platform mobile foundation |
| **App Runtime** | `expo` | `~54.0.36` | Managed native runtime & tooling |
| **Navigation** | `expo-router` | `~6.0.24` | File-based, typed, deep-link ready routing |
| **Styling** | `nativewind` / `tailwindcss` | `4.2.5` / `3.4.19` | Ahead-of-time compiled utility styling |
| **Server State** | `@tanstack/react-query` | `^5.101.0` | Caching, background synchronization, polling |
| **Client State** | `zustand` | `^5.0.14` | Fast, lightweight global state management |
| **Forms & Validation**| `react-hook-form` / `zod` | `^7.79.0` / `^4.4.3` | Performant forms with strict schema validation |
| **Camera & Barcode** | `expo-camera` | `~17.0.10` | QR ticket scanning at pit counters |
| **Image & Camera** | `expo-image-picker` | `~17.0.11` | Vehicle inspection photo capture |
| **Image Processing** | `expo-image-manipulator`| `~14.0.8` | Client-side photo compression & resizing |
| **Maps & Location** | `expo-location` / `maps` | `~19.0.8` / `1.20.1` | GPS geolocation & interactive track map |
| **Secure Storage** | `expo-secure-store` | `~15.0.8` | Keychain/Keystore encrypted token persistence |
| **Notifications** | `expo-notifications` | `~0.32.17` | Push notifications for session alerts |
| **Deep Linking** | `expo-linking` | `~8.0.12` | Payment return redirect handling |
| **Animation** | `react-native-reanimated`| `~4.1.1` | Native 60fps gesture-driven animations |
| **Typography** | `@expo-google-fonts/be-vietnam-pro` | `^0.4.1` | Professional branded typography |

---

## 🚀 Getting Started (Local Development)

### Prerequisites
- **Node.js** `>= 20.x`
- **npm** `>= 10.x`
- **Expo Go** app installed on your physical iOS or Android device, OR:
- **Xcode / iOS Simulator** (macOS) or **Android Studio / Emulator**

### 1. Installation

```bash
# 1. Navigate to the mobile directory
cd mobile

# 2. Install dependencies
npm install

# 3. Verify Expo package compatibility
npx expo install --check
```

### 2. Configure Environment

Create a `.env` file in the `mobile/` directory:

```env
# For local development with backend running on your computer:
# Replace with your machine's local Wi-Fi IP (do NOT use localhost when testing on physical devices)
EXPO_PUBLIC_API_URL=http://192.168.1.x:3000/api/v1
EXPO_PUBLIC_ENV=development

# OR connect directly to the live deployed cloud backend:
# EXPO_PUBLIC_API_URL=https://rcfield-api.onrender.com/api/v1
```

> 💡 **Tip for Physical Device Testing**: To find your Mac's local Wi-Fi IP address, run `ipconfig getifaddr en0`. Both your computer and phone must be connected to the same Wi-Fi network.

### 3. Start the Application

```bash
# Start Expo development server with Metro bundler
npx expo start --host lan --port 8082
```

- **Physical Device**: Scan the generated terminal QR code using **Expo Go** (Android) or the native **Camera app** (iOS).
- **iOS Simulator**: Press `i` in the terminal.
- **Android Emulator**: Press `a` in the terminal.
- **Web Preview**: Press `w` in the terminal.

---

## 📜 Available Scripts & Quality Assurance

The mobile project includes strict typechecking, linting, and automated testing scripts:

| Command | Purpose |
| :--- | :--- |
| `npm run start` | Starts the Expo development server with Metro bundler |
| `npm run ios` | Launches the app in the iOS Simulator |
| `npm run android` | Launches the app in the Android Emulator |
| `npm run web` | Starts the web version for quick responsive testing |
| `npm run typecheck` | Validates TypeScript strict mode (`node scripts/run-typecheck.js`) |
| `npm run lint` | Runs ESLint across the mobile codebase (`node scripts/run-lint.js`) |
| `npm test` | Executes Jest test suites with React Native Testing Library |
| `npm run check` | **One-step QA verification**: Runs typecheck, lint, and test concurrently |
| `npm run format` | Auto-formats code with Prettier |

---

## 💡 Mobile Engineering Best Practices

- **Strict Type Safety**: TypeScript strict mode enabled across all components, hooks, navigation parameters, and API models.
- **Image Compression Pipeline**: Digital inspection photos are downscaled and compressed client-side via `expo-image-manipulator` before network transmission, reducing bandwidth and upload latency on mobile connections.
- **Safe Area & Responsive Insets**: All screens integrate `react-native-safe-area-context` to properly accommodate dynamic islands, notches, and home indicator bars across diverse device form factors.
- **Keyboard Handling**: Form screens utilize `KeyboardAvoidingView` with platform-specific behavior (`padding` on iOS, `height` on Android) to ensure inputs remain visible during keyboard interaction.
- **Offline & Reconnection Resilience**: Axios interceptors automatically attach JWT bearer tokens and seamlessly handle token refreshes; TanStack Query manages query retries and cache preservation during momentary network drops.
