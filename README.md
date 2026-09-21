# RCField Platform 🏎️🏁

> **Comprehensive RC (Remote Control) Field Management, Contest Hosting & Vehicle Rental Ecosystem.**  
> An end-to-end fullstack platform designed for RC hobbyists, track owners, and tournament organizers.

🌐 **Live Web Application**: [https://rcfield-platform.vercel.app](https://rcfield-platform.vercel.app)  
⚙️ **Backend API**: [https://rcfield-api.onrender.com](https://rcfield-api.onrender.com) *(Swagger Docs: [/api-docs](https://rcfield-api.onrender.com/api-docs))*  
📰 **University Press Feature**: [Trường Đại học FPT — "Đa dạng đồ án đặc sắc của sinh viên Kỹ thuật phần mềm"](https://daihoc.fpt.edu.vn/hcm/tu-nhung-bai-toan-doi-song-den-giai-phap-cong-nghe-da-dang-do-an-dac-sac-cua-sinh-vien-ky-thuat-phan-mem/)

[![Featured on FPTU Press](https://img.shields.io/badge/Featured-FPT_University_Press-F26F21?style=flat-square)](https://daihoc.fpt.edu.vn/hcm/tu-nhung-bai-toan-doi-song-den-giai-phap-cong-nghe-da-dang-do-an-dac-sac-cua-sinh-vien-ky-thuat-phan-mem/)
[![Vercel](https://img.shields.io/badge/Vercel-Live_Demo-black?style=flat-square&logo=vercel&logoColor=white)](https://rcfield-platform.vercel.app/)
[![Render](https://img.shields.io/badge/Render-Backend_Live-46E3B7?style=flat-square&logo=render&logoColor=white)](https://rcfield-api.onrender.com)
[![Neon](https://img.shields.io/badge/Postgres-Neon_Serverless-00E599?style=flat-square&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Upstash](https://img.shields.io/badge/Redis-Upstash_TLS-00E699?style=flat-square&logo=redis&logoColor=white)](https://upstash.com/)
[![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
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
| **Cloud & DevOps** | Vercel, Render, Neon, Upstash, Docker | Global Edge CDN, Docker runtime, Serverless PostgreSQL 16, Serverless Redis TLS, Automated CI/CD |
| **NLU Service** | Python, FastAPI, SentenceTransformers | Multilingual semantic embedding (`paraphrase-multilingual-MiniLM-L12-v2`) |
| **Specs & Docs** | Markdown, Mermaid | Comprehensive system specifications, event-driven state machines, domain models |

### ☁️ Cloud Infrastructure & Deployment Architecture

The platform operates on a modern, decoupled serverless & containerized cloud architecture designed for high availability, zero cold-starts, and 24/7 reliability:

- **🌐 Frontend (Vercel)**: Single Page Application deployed on Vercel's global Edge Network, providing automatic SSL, instant cache invalidation, and seamless CI/CD on `git push`.
- **⚙️ Backend (Render)**: Containerized Express API service running in a Docker runtime with automated health checks, SSL termination, and horizontal scaling capabilities.
- **🗄️ Database (Neon.tech)**: Serverless PostgreSQL 16 featuring auto-scaling, connection pooling, and automated schema migrations.
- **⚡ Cache & Message Broker (Upstash)**: Managed Redis 7 with encryption-in-transit (TLS) powering BullMQ task queues, session caches, and distributed locks.
- **🖼️ Media CDN (Cloudinary)**: Object storage and CDN delivery for digital vehicle inspection photos and track banners.
- **🔄 Availability Monitoring (cron-job.org)**: Automated 10-minute HTTP health probes ensuring 24/7 uptime without cold-start latency.


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

**RCField** was developed as a capstone project (**SEP490**, Team **GSU26SE29**) under the guidance of instructor **Nguyen Minh Sang** at FPT University. The project was officially [featured by FPT University Press](https://daihoc.fpt.edu.vn/hcm/tu-nhung-bai-toan-doi-song-den-giai-phap-cong-nghe-da-dang-do-an-dac-sac-cua-sinh-vien-ky-thuat-phan-mem/) as an outstanding Software Engineering capstone project.

### 👤 Individual Contribution — [Nguyen Vinh Phuc](https://github.com/tomishere0712)
> **Role:** Frontend & Cross-Stack Engineer | **322 Commits** across all repositories

#### ⚛️ Frontend Web Application (React 19 & TypeScript)
- **Staff Operations & Counter POS Portal:**
  - Architected `StaffShell`, layout frames, and role-based operational contexts for venue staff.
  - Built walk-in booking wizard with visual `DailySlotGrid`, dynamic VietQR payment modal with auto-polling, and cash confirmation modal featuring an integrated quick-change calculator.
  - Implemented play session lifecycle (`StaffSessionDetailPage`), vehicle handover/return inspections with photo proofing, damage assessment, and vehicle swap UX.
- **BYOC & Customer Booking Experience:**
  - Developed end-to-end BYOC (Bring Your Own Car) flow with realtime inspection status banners, overdue alert handling, and counter settlement.
  - Created interactive venue discovery map using **Leaflet** and multi-step booking wizard with real-time pricing and F&B package calculations.
  - Built favorites system with local storage sync and API persistence.
- **State Management & Data Architecture:**
  - Implemented server-state caching, background revalidation, and optimistic UI updates via **TanStack Query v5**.
  - Built global client state with **Zustand**; enforced strict TypeScript typing (eliminated unsafe casts across public, customer, provider, staff, and admin portals).
  - Integrated real-time notifications and session events using **Socket.IO** client with custom notification bell UI.

#### 🚀 Backend Services & API Architecture (Node.js & PostgreSQL)
- **Session Lifecycle & Post-Paid Settlements:** Implemented backend entities, migrations, and controllers for active play sessions, vehicle damage inspections, and secondary post-paid checkouts (F&B orders / overtime charges).
- **Master Data, Caching & Events:** Built cafe favoriting service, booking timeout cron jobs, Socket.IO event emitters, and configured **Upstash Redis TLS** cloud integration.

#### 📱 Mobile Application Development (React Native & Expo)
- **Staff Counter & Inspection Tools:** Ported staff check-in, walk-in VietQR modal, and inspection workflows to mobile with native camera capture (`expo-camera`, `expo-image-picker`).
- **Realtime Sync & CI/CD:** Integrated push notifications (`expo-notifications`), WebSocket alerts, deep linking from notifications & VNPay redirects, and automated Android standalone APK builds via **EAS Build**.

#### 📐 System Architecture & Production Deployment
- **Architecture Design:** Authored **10 UML 2 Class Diagrams** (PlantUML) and **Conceptual ERD** covering the entire platform domain.
- **24/7 Cloud Deployment:** Deployed and maintained the zero-cost production stack on **Vercel** (Frontend), **Render Docker** (API), **Neon** (PostgreSQL 16 SSL), and **Upstash** (Redis TLS).
- **University Recognition:** Recognized in the official FPT University press feature for modeling and digitizing the complete RC Racing Cafe operations lifecycle.

