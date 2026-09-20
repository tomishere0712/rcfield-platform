# RCField Frontend 🏎️💻

> **Modern, High-Performance Web Application for RC Field Management, Live Tournament Hosting & Asset Rental Operations.**  
> Built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, and **TanStack Query v5**.

🌐 **Live Demo**: [https://rcfield-platform.vercel.app](https://rcfield-platform.vercel.app)

[![Vercel](https://img.shields.io/badge/Vercel-Live_Demo-black?style=flat-square&logo=vercel&logoColor=white)](https://rcfield-platform.vercel.app/)
[![React](https://img.shields.io/badge/React-19.2-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4.3-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![TanStack Query](https://img.shields.io/badge/TanStack_Query-v5-FF4154?style=flat-square&logo=react-query&logoColor=white)](https://tanstack.com/query)
[![Zustand](https://img.shields.io/badge/State-Zustand-orange?style=flat-square)](https://github.com/pmndrs/zustand)
[![Zod](https://img.shields.io/badge/Validation-Zod_v4-3E67B1?style=flat-square&logo=zod&logoColor=white)](https://zod.dev/)
[![Radix UI](https://img.shields.io/badge/UI-Radix_UI-161618?style=flat-square&logo=radix-ui&logoColor=white)](https://www.radix-ui.com/)

---

## 📌 Overview

**RCField Frontend** is a comprehensive single-page application (SPA) tailored for multi-tenant RC (Remote Control) track businesses. It delivers a fast, responsive, and intuitive interface across 4 distinct user roles: **Customer**, **Staff**, **Provider (Track Owner)**, and **System Admin**.

The application coordinates complex real-time workflows including interactive venue discovery, slot-based booking state machines, digital inspection photo handovers, tournament brackets, and live financial analytics.

---

## 🌟 Key Technical Highlights (ReactJS Architecture)

Designed following modern React best practices with an emphasis on performance, maintainability, and exceptional user experience:

- **⚛️ React 19 Core**: Utilizing modern React 19 features, strict typing, functional components, and custom hooks composition.
- **⚡ Fast Build & HMR**: Powered by Vite with lightning-fast Hot Module Replacement and optimized bundle splitting (`rollupOptions`).
- **🔄 Server State Management (TanStack Query v5)**:
  - Cache management with granular stale-time and cache-time configurations.
  - Optimistic updates for seamless booking actions, status toggles, and cart operations.
  - Automatic query invalidation upon mutations and background refetching.
- **📦 Client State (Zustand)**: Lightweight, boilerplate-free state management for authentication session, user preferences, active modals, and notification feeds.
- **🛡️ Strict Type-Safe Forms**: Dynamic forms powered by **React Hook Form** paired with **Zod** schema resolvers for comprehensive client-side validation and instant error feedback.
- **🎨 Modern Design System (Tailwind CSS v4 + Radix UI)**:
  - Custom UI library built on unstyled, accessible Radix UI primitives and styled with Tailwind CSS v4.
  - Smooth micro-interactions and transitions orchestrated via **Framer Motion**.
  - Consistent design tokens, dark-mode ready, and responsive layout from mobile screens to ultrawide monitors.
- **🗺️ Interactive Data Visualization & Maps**:
  - **Leaflet & React-Leaflet**: Geospatial track discovery with custom pins, radius search, and interactive venue cards.
  - **Recharts**: Rich business intelligence dashboards featuring revenue trends, peak booking hours, and fleet utilization metrics.
- **📡 Real-Time Updates**: WebSocket integration (`useWebSocket`) coupled with resilient polling fallback mechanisms for instant payment confirmation and live session countdowns.

---

## 🧭 Four Role Portals & Feature Modules

The frontend is structured into 4 specialized role portals, encompassing **31 business feature modules**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          RCField Web Platform                          │
├─────────────────┬─────────────────┬──────────────────┬─────────────────┤
│ Customer Portal │  Staff Counter  │  Provider Hub    │  Admin Console  │
│ • Venue Map     │ • QR Scanner    │ • Branch Config  │ • KYC Approvals │
│ • Booking Flow  │ • Photo Inspect │ • Fleet Catalog  │ • SaaS Billing  │
│ • PayOS / QR    │ • Damage Charge │ • Staff Invites  │ • Audit Logs    │
│ • Session View  │ • F&B Orders    │ • KPI Analytics  │ • Feature Flags │
└─────────────────┴─────────────────┴──────────────────┴─────────────────┘
```

### 1. 🏁 Customer Portal
- **Interactive Venue Discovery**: Search RC tracks on a dynamic map with multi-criteria filtering (price range, track surface, rental availability, amenities).
- **Booking Wizard**: Step-by-step slot reservation supporting both **Rental** (fleet car + transmitter) and **BYOC** (Bring Your Own Car).
- **F&B Pre-Ordering**: Bundle snacks and beverages directly into the booking invoice.
- **Payment Experience**: Real-time VietQR code generation with countdown timer and instant payment confirmation webhook listener.
- **Session & Review**: Live timer during race sessions, inspection photo verification, and post-session rating & review submission.

### 2. 📱 Staff Counter Hub (Mobile-First)
- **Fast QR Ticket Scanner**: Browser-based camera QR code scanning (`jsqr`) for rapid customer check-in at the pit area.
- **Digital Asset Handover (Inspection Flow)**: Guided photo capture of vehicle condition (front, rear, chassis, electronics) before and after sessions to eliminate damage disputes.
- **Incident & Damage Management**: Record vehicle damage with photo evidence and compute repair deductions from deposits.
- **On-Field F&B POS**: Quick order creation for refreshments while racers are on track.

### 3. 📊 Provider (Track Owner) Hub
- **Branch & Track Management**: Configure operating schedules, track dimensions, surface types (drift/carpet/clay), and pricing tiers.
- **Fleet & Inventory Control**: Track individual RC cars, telemetry units, battery cycles, maintenance schedules, and replacement histories.
- **Staff Delegation**: Invite staff members via email with role-based permissions scoped to specific branches.
- **Financial & KPI Analytics**: Interactive charts showing revenue streams, occupancy rates, and member retention.
- **Tournament Organizer**: Host racing competitions, seed brackets, classify vehicle classes, and record live lap results.
- **Branch Banking Configuration**: Set up dedicated bank accounts for branch-level transfers with automated VietQR generation.

### 4. 🛡️ Platform Admin Console
- **Provider KYC Verification**: Review business registration documents and approve new track operators.
- **SaaS Subscription Management**: Monitor platform subscription tiers and billing status.
- **System Health & Logs**: Centralized audit trails and platform-wide configuration toggles.

---

## 📂 Project Structure

Organized using a **Feature-Driven Architecture**:

```text
frontend/src/
├── app/                  # Application bootstrapping, providers & router config
│   ├── layouts/          # Role-based layouts (AdminLayout, ProviderLayout, StaffLayout)
│   ├── providers/        # QueryClientProvider, AuthProvider, ThemeProvider
│   └── routes/           # Protected routes, role guards, and route definitions
├── assets/               # Static images, logos, and icons
├── features/             # 31 Domain-driven feature modules
│   ├── auth/             # Login, register, OAuth, password recovery
│   ├── booking/          # Booking state machine, wizard steps, slot grid
│   ├── cafes/            # Track profiles, operating hours, amenities
│   ├── contests/         # Tournament brackets, registrations, leaderboards
│   ├── dashboard/        # Role-specific dashboard widgets & KPI metrics
│   ├── inspections/      # Digital vehicle inspection & photo proof
│   ├── payments/         # Payment gateways, VietQR panel, transaction logs
│   ├── vehicles/         # Fleet management, vehicle units, catalog
│   └── ...               # (fnb, reviews, schedule, subscriptions, etc.)
├── pages/                # High-level page components routing to features
│   ├── admin/            # Admin management views
│   ├── auth/             # Authentication pages
│   ├── booking/          # Booking creation & detail pages
│   ├── customer/         # Customer profile, sessions, and history
│   ├── provider/         # Provider hub, fleet, analytics, bank settings
│   ├── public/           # Landing page, cafe explore, guides
│   └── staff/            # Staff check-in counter, inspection, quick POS
├── shared/               # Reusable primitives across features
│   ├── components/       # Radix/Tailwind UI primitives (Dialog, Table, Button, etc.)
│   ├── hooks/            # Custom hooks (useDebounce, useMediaQuery, useWebSocket)
│   ├── lib/              # Axios instance, queryClient, date helpers
│   └── types/            # Shared TypeScript interfaces & models
└── styles/               # Global CSS & Tailwind v4 theme configuration
```

---

## 🛠️ Getting Started

### Prerequisites
- Node.js `>= 20.x`
- npm `>= 10.x`

### Installation & Local Run

```bash
# 1. Navigate to frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.development

# 4. Start local development server
npm run dev
```

The application will be accessible at: `http://localhost:5173`

---

## 📜 Available Scripts

| Script | Command | Purpose |
| :--- | :--- | :--- |
| **Development** | `npm run dev` | Starts Vite dev server with Hot Module Replacement |
| **Production Build** | `npm run build` | Typechecks with `tsc` and bundles with Vite |
| **Preview** | `npm run preview` | Previews the production bundle locally |
| **Linting** | `npm run lint` | Runs ESLint across the codebase |
| **Testing** | `npm test` | Executes unit and component tests with Vitest |

---

## 💡 Engineering Practices

- **Zero `any` Policy**: Strict TypeScript checking enabled across all components, hooks, and API services.
- **Component Colocation**: Feature-specific styles, hooks, and sub-components are colocated with their parent feature.
- **Accessible UI**: Keyboard navigable dialogs, dropdowns, and form elements powered by Radix UI.
- **Clean API Layer**: Centralized Axios client with automatic bearer token injection and standard error handling.
