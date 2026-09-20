# RCField Platform 🏎️🏁

> **Comprehensive RC (Remote Control) Field Management, Contest Hosting & Vehicle Rental Ecosystem.**  
> An end-to-end fullstack platform designed for RC hobbyists, track owners, and tournament organizers.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![React Native](https://img.shields.io/badge/React_Native-Expo_54-000020?style=flat-square&logo=expo&logoColor=white)](https://expo.dev/)
[![Express](https://img.shields.io/badge/Express-Backend-black?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS_v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![PayOS](https://img.shields.io/badge/Payment-PayOS-green?style=flat-square)](https://payos.vn/)
[![Gemini AI](https://img.shields.io/badge/AI-Google_Gemini-4285F4?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)

---

## 📌 Overview

**RCField** solves the operational complexities of running hobbyist RC race tracks and club events. The platform connects RC enthusiasts with field venues, offering seamless track bookings, tournament management, vehicle rentals, and automated payment workflows.

### 🌟 Core Capabilities
- **🏟️ Field & Track Booking**: Real-time slot availability, track selection, booking state machine, and cancellation policies.
- **🏆 Contest & Tournament Management**: Racer registrations, bracket management, vehicle classification, and live tournament tracking.
- **🚗 Vehicle & Equipment Rental**: Inventory tracking, rental check-in/check-out, and on-field vehicle swap workflows.
- **💳 Integrated Payment Gateway**: PayOS integration for automated QR-code banking transfers and instant webhook confirmations.
- **🤖 AI & NLU Assistant**: Intelligent query understanding powered by Google Gemini and multilingual sentence transformers.

---

## 🏗️ Repository Architecture (Monorepo)

```text
rcfield-platform/
├── backend/          # RESTful API, TypeORM, BullMQ, PayOS, AI/NLU integration
├── frontend/         # Web dashboard for administrators, staff, and field operators
├── mobile/           # Cross-platform mobile app for RC racers and customers (Expo)
└── docs/             # Domain models, state machines, API specs, and defense playbooks
```

### 🧩 Components & Tech Stack

| Component | Tech Stack | Key Highlights |
| :--- | :--- | :--- |
| **Backend** | Node.js, Express, TypeScript, TypeORM | Modular architecture, BullMQ job queues, Zod validation, Swagger OpenAPI, PayOS gateway, Gemini AI |
| **Frontend** | React 19, Vite, TailwindCSS v4, TypeScript | TanStack Query v5, TanStack Table, Leaflet Maps, React Hook Form |
| **Mobile** | React Native, Expo 54, Expo Router | Expo Camera (QR check-in), Expo Auth Session, TanStack Query |
| **NLU Service** | Python, FastAPI, SentenceTransformers | Multilingual semantic embedding (`paraphrase-multilingual-MiniLM-L12-v2`) |
| **Specs & Docs** | Markdown, Mermaid | Comprehensive system specifications, event-driven state machines, domain models |

---

## 🚀 Getting Started

### Prerequisites
- Node.js `>= 20.x`
- Python `>= 3.10` (for NLU service)
- PostgreSQL & Redis (for queues & cache)

### 1. Backend Setup
```bash
cd backend
npm install
npm run dev
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 3. Mobile Setup
```bash
cd mobile
npm install
npx expo start
```

---

## 📄 License & Attribution
Developed as part of the **SEP490 Capstone Project** at FPT University.  
Maintained by [Nguyen Vinh Phuc](https://github.com/tomishere0712).
