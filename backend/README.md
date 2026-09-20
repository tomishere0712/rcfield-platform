# RCField Backend 🏎️⚙️

> **Enterprise-Grade RESTful API & Real-Time Engine for Multi-Tenant RC Field Management.**  
> Built with **Node.js**, **Express**, **TypeScript**, **TypeORM**, **PostgreSQL 16**, **Redis 7**, and **BullMQ**.

⚙️ **Live API Server**: [https://rcfield-api.onrender.com](https://rcfield-api.onrender.com)  
📚 **Swagger API Documentation**: [https://rcfield-api.onrender.com/api-docs](https://rcfield-api.onrender.com/api-docs)

[![Render](https://img.shields.io/badge/Render-Backend_Live-46E3B7?style=flat-square&logo=render&logoColor=white)](https://rcfield-api.onrender.com)
[![Neon](https://img.shields.io/badge/Postgres-Neon_Serverless-00E599?style=flat-square&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Upstash](https://img.shields.io/badge/Redis-Upstash_TLS-00E699?style=flat-square&logo=redis&logoColor=white)](https://upstash.com/)
[![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-Backend-black?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![TypeORM](https://img.shields.io/badge/TypeORM-0.3-FE0803?style=flat-square&logo=typeorm&logoColor=white)](https://typeorm.io/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)
[![BullMQ](https://img.shields.io/badge/BullMQ-Queue-B7178C?style=flat-square)](https://bullmq.io/)
[![Zod](https://img.shields.io/badge/Validation-Zod-3E67B1?style=flat-square&logo=zod&logoColor=white)](https://zod.dev/)
[![PayOS](https://img.shields.io/badge/Payment-PayOS-green?style=flat-square)](https://payos.vn/)
[![Gemini AI](https://img.shields.io/badge/AI-Google_Gemini-4285F4?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)

---

## 📌 Overview

**RCField Backend** is the core business logic and API service powering the entire RCField ecosystem. Architected as a **multi-tenant B2B SaaS platform** for RC (Remote Control) track operators (Providers) in Vietnam, it coordinates operational workflows across 4 distinct user roles: **Customer**, **Staff**, **Provider**, and **Platform Admin**.

### Current Scope & Metrics
- **70 relational database tables** (PostgreSQL 16 with `pgvector` extension)
- **67 TypeORM Entities**, **62 Services**, **40 Route groups**, **86 Migrations**
- **58 integration test suites (Jest)** running against real database instances

---

## 🏗️ System Architecture

The service is structured following a **Domain-Driven Layered Architecture**:

```text
HTTP Request (Client / Webhook / Mobile)
               │
               ▼
      [ Middleware Layer ]       ── JWT Auth, RBAC Guards, Rate Limiting, Error Handler
               │
               ▼
      [ Controller Layer ]       ── Request validation (Zod Schemas), DTO mapping
               │
               ▼
       [ Service Layer ]         ── Pure business logic, state machines, transactions
         │            │
         ▼            ▼
   [ Repositories ] [ BullMQ Jobs ] ── Asynchronous queue workers (timeouts, notifications)
         │
         ▼
[ PostgreSQL 16 ] + [ Redis 7 ]    ── Data persistence, distributed locks, session caching
```

**Request Pipeline**: `Route → Middleware → Controller → Service → Repository/Entity`.  
- **Controllers** strictly validate incoming request bodies and query parameters via **Zod** before calling the service layer.
- **Services** encapsulate 100% of domain business logic, manage database transactions, and dispatch asynchronous events/jobs.

---

## 🌟 Core Features & Modules

### 1. 🏟️ Booking & Slot State Machine
- Real-time time slot availability tracking based on venue capacity and track surface types (Drift, Carpet, Clay/Dirt).
- Dual play-mode support: **RENTAL** (vehicle + radio transmitter rental) and **BYOC** (Bring Your Own Car).
- Immutable price snapshotting at booking creation (`snapshot`), preventing billing discrepancies when track pricing changes later.
- Automated 30-minute reservation locks that automatically release unconfirmed slots if payment is not completed.

### 2. 🔍 Vehicle Handover & Digital Inspection Flow
- Mandatory 4-angle digital photo handover protocol (Front, Rear, Left/Right, Electronics/Chassis) at check-in and check-out.
- Eliminates subjective vehicle damage disputes between customers and track staff.
- Transparent damage charge calculations referencing itemized replacement parts (`damage_line_items`).

### 3. 💳 Payment Engine & Automated Reconciliation
- **PayOS & VNPay**: Online payment gateway integration with idempotent webhook processing.
- **Branch VietQR**: Dynamic EMVCo QR code generation embedding unique transaction reference codes (`RCFxxxxx`).
- **Bank Statement Reconciliation**: Ingests and auto-reconciles bank statement webhooks (SePay / Sandbox), handling discrepancies and delayed payment edge cases.

### 4. 🏆 Contest & Tournament Engine
- Racer registrations, vehicle technical class validation (1/10, 1/8, Mini-Z), and tech-check compliance.
- Automated tournament bracket generation, round-by-round heat results recording, and event finance accounting.

### 5. 🤖 AI Assistant & NLU Sidecar Service
- Integrated with **Google Gemini 2.0** for intelligent, context-aware customer support.
- **NLU Service (FastAPI + SentenceTransformers)**: Sidecar microservice for multilingual intent classification (`paraphrase-multilingual-MiniLM-L12-v2`), powering RAG knowledge base retrieval per branch.

---

## 🛠️ Detailed Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime** | Node.js 20+ LTS | Server-side execution environment |
| **Language** | TypeScript (Strict Mode) | Type safety, maintainability, and clean contracts |
| **Framework** | Express.js | Domain-driven routing and middleware pipeline |
| **Database** | PostgreSQL 16 + pgvector (Neon Serverless) | Relational persistence and semantic vector search |
| **ORM** | TypeORM 0.3 | Schema management, migrations, and entity mapping |
| **Cache & Queue** | Redis 7 (Upstash Serverless TLS) + BullMQ | Distributed locks, data caching, background workers |
| **Validation** | Zod | Runtime type-safe request validation |
| **Authentication** | JWT + RBAC | Role-based authorization across 4 user roles |
| **Payments** | PayOS, VietQR, VNPay | Online gateways and automated bank transfer reconciliation |
| **File Storage** | Cloudinary | Digital vehicle inspection photo storage and CDN delivery |
| **API Documentation**| OpenAPI 3.0 / Swagger | Interactive API exploration generated from schemas |
| **Cloud Hosting** | Render (Docker) + Neon + Upstash | 24/7 containerized and serverless production deployment |

---

## 🚀 Getting Started (Local Development)

### Prerequisites
- **Node.js** `>= 20.x`
- **Docker Desktop** (to run PostgreSQL 16 and Redis 7 locally)
- **Python** `>= 3.10` (optional, for running the NLU microservice)

### Installation & Setup

```bash
# 1. Navigate to the backend directory
cd backend

# 2. Install dependencies
npm install

# 3. Start PostgreSQL + Redis via Docker, run migrations, and start server
npm run up:all
```

Once started:
- **API Server**: `http://localhost:3000`
- **Swagger Documentation**: `http://localhost:3000/api-docs`
- **Health Check**: `http://localhost:3000/api/v1/health`

### Seed Demo Data

```bash
# Seed all demo data (users, cafes, vehicles, menu, contests)
npm run seed:all

# Or seed only the 4 default role accounts
npm run seed
```

---

## 👥 Demo & Testing Accounts

| Role | Email | Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@gmail.com` | `123456` | Platform management, KYC approval, SaaS plans, system audit logs |
| **PROVIDER** | `provider@gmail.com` | `123456` | Branch management, fleet catalog, revenue analytics, tournament setup |
| **STAFF** | `staff@gmail.com` | `123456` | Counter operations, QR check-in scanning, vehicle photo inspections |
| **CUSTOMER** | `customer@gmail.com` | `123456` | Track booking, VietQR payments, session tracking, contest entry |

---

## 📜 Available Scripts

```bash
# Development
npm run dev              # Starts development server with nodemon and ts-node
npm run build            # Compiles TypeScript to dist/
npm start                # Runs the compiled production bundle

# Testing & Quality Assurance
npm test                 # Executes all 58 Jest integration test suites
npm test -- bookings     # Runs specific test suites matching the filter
npm run test:coverage    # Generates code coverage report
npm run lint             # Runs ESLint checks
npm run format:check     # Checks code formatting with Prettier

# Database & Migrations
npm run migration:run      # Executes pending TypeORM migrations
npm run migration:revert   # Reverts the latest migration
npm run migration:generate src/migrations/MigrationName # Generates migration from entities
npm run seed:all           # Seeds complete demo dataset
```

---

## 📂 Source Code Structure

```text
backend/src/
├── server.ts            # HTTP & WebSocket server entrypoint
├── app.ts               # Express application setup & middleware pipeline
├── config/              # TypeORM DataSource, Redis, Logger, and environment config
├── routes/              # 40 route groups mounted under /api/v1
├── controllers/         # Request handling, Zod validation, response formatting
├── services/            # 62 services encapsulating core business logic
├── models/              # 67 TypeORM entities
├── middlewares/         # JWT authentication, RBAC guards, error handling, rate limiting
├── jobs/                # BullMQ queue workers & scheduled jobs
├── migrations/          # 86 database migration files
├── validate/            # Zod validation schemas grouped by domain
├── types/               # Type definitions, enums, AppError
└── __tests__/           # 58 integration test suites executed on real DB
```

---

## 🚀 Production Deployment (Render + Neon + Upstash)

The backend API is containerized with Docker and deployed independently on cloud infrastructure:

- **Live API Server**: [https://rcfield-api.onrender.com](https://rcfield-api.onrender.com)
- **Swagger Documentation**: [https://rcfield-api.onrender.com/api-docs](https://rcfield-api.onrender.com/api-docs)
- **Hosting Platform**: **Render** (Containerized Web Service via `Dockerfile`)
  - Multi-stage build using `node:20-alpine`, builds TypeScript and runs `dist/server.js`
  - Health check endpoint: `GET /api/v1/health` (HTTP 200 OK)
- **Database**: **Neon Serverless PostgreSQL 16** (AWS Singapore `ap-southeast-1`)
  - Connection pooling configured with `sslmode=require&channel_binding=require`
  - All 86 migrations applied and 71 production tables synchronized
- **Cache & Message Queue**: **Upstash Serverless Redis 7**
  - Secure TLS connection on port `6379` (`REDIS_TLS=true`)
  - Powers BullMQ job queues, session caching, and distributed locks
- **Uptime Monitoring & Keep-Alive**:
  - Configured 10-minute automated HTTP health checks via cron-job to ensure 24/7 uptime without cold-start delays.

---

## 📖 Specifications & Architecture Reference
Detailed domain models (ERD), booking state machines, payment engine rules, and vehicle inspection handover protocols are documented in the [docs/](file:///Users/phucnguyenvinh/FPT%20SE%20Learning/SE_9/Project/rcfield-platform/docs) directory.
