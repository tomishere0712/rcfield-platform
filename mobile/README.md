# RCField Mobile 📱🏎️

> **Cross-Platform Mobile Application for RC Racers & Track Staff.**  
> Built with **React Native**, **Expo SDK 54**, **Expo Router**, and **NativeWind v4**.

[![React Native](https://img.shields.io/badge/React_Native-0.81-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-SDK_54-000020?style=flat-square&logo=expo&logoColor=white)](https://expo.dev/)
[![NativeWind](https://img.shields.io/badge/Tailwind-NativeWind_v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://www.nativewind.dev/)
[![TanStack Query](https://img.shields.io/badge/TanStack_Query-v5-FF4154?style=flat-square&logo=react-query&logoColor=white)](https://tanstack.com/query)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

---

## 📌 Overview

**RCField Mobile** delivers a native on-the-go experience for RC enthusiasts and on-field track staff. Racers can discover nearby RC tracks, book driving slots, rent vehicles, register for tournaments, and receive live session notifications. On-field staff can scan QR tickets and conduct digital vehicle inspections directly from their phones.

---

## 🌟 Core Features

### 1. 🏎️ Customer Experience
- **Explore & Geolocation**: Discover nearby RC tracks with distance calculations and interactive maps (`expo-location`, `react-native-maps`).
- **Venue Details & Slot Booking**: Browse track specs, surface conditions, rental fleets, and available time slots.
- **Contests & Tournaments**: Register for club races, check entrant lists, and view tournament brackets.
- **Favorites & Notifications**: Bookmark preferred tracks and receive push notifications for upcoming bookings.
- **Payment Verification**: Deep linking support for automated return handling after banking app transfers.

### 2. 🏁 Staff Counter & On-Field Operations
- **Camera QR Scanner**: Fast ticket check-in at the pit area powered by `expo-camera`.
- **Vehicle Inspection Flow**: Capture photo evidence before and after rental sessions using the device camera (`expo-image-picker`).

---

## 🛠️ Tech Stack

- **Framework**: React Native 0.81, Expo SDK 54, Expo Router v6 (File-based routing)
- **Styling**: NativeWind v4 (Tailwind CSS for React Native)
- **State & Data Fetching**: TanStack Query v5, Zustand
- **Networking**: Axios with interceptors
- **Form & Validation**: React Hook Form, Zod
- **Hardware Integrations**: `expo-camera`, `expo-location`, `expo-image-picker`, `expo-secure-store`
- **Typography & Icons**: Be Vietnam Pro, Lucide React Native
- **Testing**: Jest, React Native Testing Library

---

## 📂 Project Structure

```text
mobile/
├── app/                         # Expo Router route definitions
│   ├── (auth)/                  # Authentication routes (login, register)
│   ├── (tabs)/                  # Bottom tab navigation (Explore, Bookings, Contests, Profile)
│   ├── booking/                 # Booking wizard & checkout screens
│   ├── cafe-detail/             # Cafe profile, track details, reviews
│   ├── staff/                   # Staff QR scanner & check-in flow
│   ├── _layout.tsx              # Root layout & providers
│   └── index.tsx                # Initial route controller
├── src/
│   ├── features/                # Domain-driven feature implementations
│   │   ├── auth/                # Authentication logic & screens
│   │   ├── bookings/            # Booking management & list
│   │   ├── contests/            # Tournament details & racer registration
│   │   ├── explore/             # Track search & discovery
│   │   ├── staff/               # QR scanner & check-in implementation
│   │   └── ...                  # (favorites, home, notifications, reviews, packages)
│   └── shared/                  # Shared primitives, UI components, hooks, stores
├── assets/                      # Icons, splash screens, and images
└── global.css                   # NativeWind global stylesheet
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js `>= 20.x`
- npm `>= 10.x`
- Expo Go app (on iOS/Android) or iOS Simulator / Android Emulator

### Installation & Run

```bash
# 1. Navigate to mobile directory
cd mobile

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env

# 4. Start Expo development server
npm run start
```

Press `i` to launch in iOS Simulator, `a` for Android Emulator, or scan the QR code with **Expo Go**.

---

## 📜 Available Scripts

| Command | Purpose |
| :--- | :--- |
| `npm run start` | Starts Expo dev server with Metro bundler |
| `npm run ios` | Starts Expo and opens iOS simulator |
| `npm run android` | Starts Expo and opens Android emulator |
| `npm run web` | Starts Expo web version |
| `npm run typecheck` | Validates TypeScript types |
| `npm run lint` | Runs ESLint validation |
| `npm test` | Runs Jest test suite |
