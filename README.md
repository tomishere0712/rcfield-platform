# RCField Platform 🏎️🏁

> **Comprehensive RC (Remote Control) Field Management, Contest Hosting & Vehicle Rental Ecosystem.**  
> An end-to-end fullstack platform designed for RC hobbyists, track owners, and tournament organizers.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![React Native](https://img.shields.io/badge/React_Native-Expo_54-000020?style=flat-square&logo=expo&logoColor=white)](https://expo.dev/)
[![Express](https://img.shields.io/badge/Express-Backend-black?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS_v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![TanStack Query](https://img.shields.io/badge/TanStack_Query-v5-FF4154?style=flat-square&logo=react-query&logoColor=white)](https://tanstack.com/query)
[![PayOS](https://img.shields.io/badge/Payment-PayOS-green?style=flat-square)](https://payos.vn/)
[![Gemini AI](https://img.shields.io/badge/AI-Google_Gemini-4285F4?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)

---

## 📌 Overview

**RCField** solves the operational complexities of running hobbyist RC race tracks and club events. The platform connects RC enthusiasts with field venues, offering seamless track bookings, tournament management, vehicle rentals, and automated payment workflows.

### 🌟 Core Capabilities
- **🏟️ Field & Track Booking**: Real-time slot availability, track selection, booking state machine, and cancellation policies.
- **🏆 Contest & Tournament Management**: Racer registrations, bracket management, vehicle classification, and live tournament tracking.
- **🚗 Vehicle & Equipment Rental**: Inventory tracking, rental check-in/check-out with digital photo inspection, and on-field vehicle swap workflows.
- **💳 Integrated Payment Gateway**: PayOS & VietQR integration for automated QR-code transfers and instant webhook confirmations.
- **🤖 AI & NLU Assistant**: Intelligent query understanding powered by Google Gemini and multilingual sentence transformers.

---

## ⚛️ Frontend & ReactJS Engineering Highlights

> **Primary Focus**: Modern, scalable Single Page Application (SPA) built with **React 19**, **Vite**, **TypeScript (Strict)**, and **Tailwind CSS v4**.

- **Modern Architecture**: Feature-Driven architecture organizing 31 business feature modules (`src/features/`) with clear separation of concerns.
- **Advanced State Management**:
  - **Server State**: **TanStack Query v5** handling server caching, background data synchronization, automatic garbage collection, and optimistic UI updates for booking and cart interactions.
  - **Client State**: Lightweight **Zustand** stores managing user authentication tokens, active modals, and notification feeds.
- **Robust Type-Safe Forms**: Dynamic multi-step forms built with **React Hook Form** and validated client-side with **Zod** schema resolvers.
- **Data Visualization & Geospatial UI**:
  - **Leaflet & OpenStreetMap**: Interactive venue explorer with geolocation, custom track pins, and distance-based filtering.
  - **Recharts**: Business intelligence dashboards visualizing revenue breakdowns, hourly occupancy, and fleet utilization.
- **Component Design System**: Reusable, accessible UI components built on **Radix UI** primitives and styled with **Tailwind CSS v4** utility tokens, enriched with **Framer Motion** micro-interactions.
- **Real-Time Synchronization**: WebSocket integration (`useWebSocket`) coupled with a 5-second polling fallback for automated VietQR payment confirmations and session timers.

👉 *For an in-depth breakdown of the frontend architecture and modules, see the [Frontend Documentation](file:///Users/phucnguyenvinh/FPT%20SE%20Learning/SE_9/Project/rcfield-platform/frontend/README.md).*

---

## 🏗️ Repository Architecture (Monorepo)

```text
rcfield-platform/
├── backend/          # RESTful API, TypeORM, BullMQ, PayOS, AI/NLU integration
├── frontend/         # Web application for Customers, Staff, Providers, and Admins
├── mobile/           # Cross-platform mobile app for RC racers and staff (Expo 54)
└── docs/             # Domain models, state machines, API specs, and defense playbooks
```

### 🧩 Components & Tech Stack

| Component | Tech Stack | Key Highlights |
| :--- | :--- | :--- |
| **Frontend** | React 19, Vite, TailwindCSS v4, TypeScript | TanStack Query v5, Zustand, TanStack Table, Leaflet Maps, React Hook Form, Zod, Radix UI |
| **Backend** | Node.js, Express, TypeScript, TypeORM | Modular architecture, BullMQ job queues, Zod validation, Swagger OpenAPI, PayOS gateway, Gemini AI |
| **Mobile** | React Native, Expo 54, Expo Router, NativeWind | Expo Camera (QR check-in), Expo Auth Session, TanStack Query, Expo Location |
| **NLU Service** | Python, FastAPI, SentenceTransformers | Multilingual semantic embedding (`paraphrase-multilingual-MiniLM-L12-v2`) |
| **Specs & Docs** | Markdown, Mermaid | Comprehensive system specifications, event-driven state machines, domain models |

---

## 👥 Demo Accounts & Testing Credentials

For quick evaluation and testing of role-based permissions and workflows:

| Role | Email | Password | Primary Interfaces & Flows to Explore |
| :--- | :--- | :--- | :--- |
| **Platform Admin** | `admin@gmail.com` | `123456` | Provider KYC verification, SaaS subscription management, system audit logs |
| **Track Provider** | `provider@gmail.com` | `123456` | Branch setup, fleet management, staff invitations, revenue & KPI analytics, tournament creation |
| **Counter Staff** | `staff@gmail.com` | `123456` | Mobile-friendly check-in counter, camera QR scanning, vehicle photo inspection handover |
| **Customer** | `customer@gmail.com` | `123456` | Interactive track map, booking wizard, VietQR payment, live session tracking |

---

## 🚀 Getting Started

### Prerequisites
- Node.js `>= 20.x`
- npm `>= 10.x`
- PostgreSQL & Redis (for Backend)
- Python `>= 3.10` (optional, for NLU service)

### 1. Frontend Setup (Web App)
```bash
cd frontend
npm install
npm run dev
# Accessible at http://localhost:5173
```

### 2. Backend Setup (API Server)
```bash
cd backend
npm install
npm run dev
# Accessible at http://localhost:3000 (Swagger docs at /api-docs)
```

### 3. Mobile Setup (React Native / Expo)
```bash
cd mobile
npm install
npx expo start
```

## 👥 Team & Individual Contributions

**RCField** was developed as a capstone project (**SEP490**) by a team of software engineering students at FPT University.

### 👤 Individual Contribution — [Nguyen Vinh Phuc](https://github.com/tomishere0712)
- **Primary Focus — Frontend Web (ReactJS)**:
  - Spearheaded the design and implementation of the single-page web application using **React 19**, **Vite**, **TypeScript (Strict)**, and **Tailwind CSS v4**.
  - Architected the server-state strategy with **TanStack Query v5** (caching, optimistic UI updates, cache invalidation) and client-state with **Zustand**.
  - Built interactive venue discovery with **Leaflet**, multi-step booking wizard, dynamic form validation using **React Hook Form + Zod**, and real-time VietQR payment confirmation.
  - Developed responsive data-driven dashboards using **Radix UI** primitives and **Recharts**.
- **Cross-Stack Contributions (Fullstack & Mobile)**:
  - **Mobile (React Native / Expo)**: Contributed to customer booking flows, venue exploration, and integrated device camera QR scanning for counter staff check-in.
  - **Backend (Node.js / Express / TypeORM)**: Collaborated on RESTful API design, database schema modeling (PostgreSQL), webhook handling, and data seeding scripts.

