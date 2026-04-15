# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains KD TAXI — a simplified Uber-style mobile app for small cities.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 + Socket.io
- **Database**: In-memory (Map-based, no DB for first build)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Mobile**: Expo (React Native) with Expo Router

## Apps

### KD TAXI (`artifacts/kd-taxi`)
- Mobile app (Expo + React Native)
- 3 user modes: Client, Driver, Admin
- Real-time via Socket.io
- Screens: Login, ClientHome, DriverHome, AdminHome, Chat
- Theme: Dark (#0D0D0D) with yellow (#F5C518) primary

### API Server (`artifacts/api-server`)
- Express 5 with Socket.io
- Routes: /login, /request-ride, /accept-ride, /finish-ride, /cancel-ride, /rides, /users
- Admin routes: PUT/DELETE /admin/users/:id, DELETE /admin/rides, GET /admin/stats, POST /admin/users
- Admin auth: password-protected, default admin phone="admin" password="admin123"
- Socket events: nova_corrida, corrida_aceita, corrida_finalizada, corrida_cancelada, mensagem_chat
- safeUser() strips passwords from all responses

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Architecture Decisions

- In-memory data store (Map) for simplicity — no database needed for MVP
- Socket.io for real-time ride events and chat
- AsyncStorage for client-side persistence (user session, driver online status)
- No maps, no payments — focused on ride flow + communication

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
