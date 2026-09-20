# RCField Frontend

Base frontend for RCField, built with Vite, React, TypeScript, Tailwind CSS, shadcn/ui, React Router, TanStack Query, Axios, Zustand, React Hook Form, Zod, TanStack Table, Recharts, Vitest, and Playwright.

## Scripts

```bash
pnpm install
pnpm dev
pnpm lint
pnpm test
pnpm build
```

## Architecture

- App bootstrap, providers, router, and layouts live in `src/app`.
- Shared UI, utilities, hooks, schemas, and types live in `src/shared`.
- Business modules live under `src/features` with feature-based folders.
- Public placeholder pages live in `src/pages`.
- Import alias `@` maps to `src`.

## Phase One Scope

This setup includes foundation code only: providers, API client, env config, route skeletons, role guard stubs, shadcn/ui base components, and feature folder structure. Customer, staff, provider, and admin business screens are intentionally left for later phases.
