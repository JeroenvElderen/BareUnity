# BareUnity

BareUnity has been refactored to your requested stack foundation:

- **Frontend:** Next.js + TypeScript + Tailwind CSS + shadcn/ui conventions
- **API:** tRPC
- **State:** Zustand + TanStack Query
- **Backend:** PostgreSQL + Prisma
- **Auth:** Auth.js
- **Infrastructure:** Supabase
- **Deployment:** Vercel

## What is included

- tRPC server context/router scaffold under `src/server/api`
- tRPC route handler under `src/app/api/trpc/[trpc]/route.ts`
- React provider wiring for tRPC + TanStack Query under `src/trpc/react.tsx` and `src/app/providers.tsx`
- Zustand store example under `src/stores/ui-store.ts`
- Prisma schema under `prisma/schema.prisma`
- Auth.js setup under `src/auth.ts` and `src/app/api/auth/[...nextauth]/route.ts`
- shadcn/ui-style utility + Button component (`src/lib/utils.ts`, `src/components/ui/button.tsx`)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure env:

```bash
cp .env.example .env.local
```

3. Run Prisma generation/migrations:

```bash
npm run db:generate
npm run db:migrate
```

4. Start app:

```bash
npm run dev
```

## Notes for this execution environment

Package downloads are blocked in this environment (`npm 403 Forbidden`), so dependency installation cannot be completed here. The repository has been updated so it is ready to install/run in a normal environment with npm access.