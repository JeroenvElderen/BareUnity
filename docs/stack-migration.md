# Stack migration guide

This guide defines how to migrate BareUnity to the requested stack.

## Target architecture

* **App framework:** Next.js App Router (TypeScript)
* **Styling system:** Tailwind CSS + shadcn/ui
* **API layer:** tRPC (server routers + typed client)
* **State management:**

  * **Server state:** TanStack Query
  * **Client state:** Zustand
* **Database:** PostgreSQL (Supabase Postgres)
* **ORM:** Prisma
* **Authentication:** Auth.js
* **Hosting/deploy:** Vercel

---

# ✅ Completed

## 1) Install dependencies

Dependencies installed:

```bash
npm install @trpc/server @trpc/client @trpc/react-query @tanstack/react-query @tanstack/react-query-devtools zustand zod superjson prisma @prisma/client next-auth @auth/prisma-adapter class-variance-authority clsx tailwind-merge lucide-react @radix-ui/react-slot
```

---

## 2) Add Prisma + PostgreSQL

Prisma has been initialized and connected to Supabase Postgres.

Key setup completed:

* Prisma initialized
* `DATABASE_URL` configured
* Prisma schema mapped to Supabase tables
* `public` and `auth` schemas configured
* Prisma Client successfully generated

Important note:

Supabase manages the database schema. Prisma is used **only as an ORM and query client**.

Workflow for schema updates:

```bash
npx prisma db pull
npx prisma generate
```

Do **not** run Prisma migrations against the Supabase database.

---

## 3) Configure Auth.js

Auth.js is installed and operational.

Files implemented:

```
src/auth.ts
src/app/api/auth/[...nextauth]/route.ts
```

Configuration includes:

* Prisma adapter
* Supabase Postgres database
* GitHub authentication provider

Authentication endpoint verified:

```
http://localhost:3000/api/auth/signin
```

---

## 4) Configure tRPC

tRPC is configured as the typed API layer between Next.js and Prisma.

Implemented:

* server router and root router
* context including Prisma + Auth.js session
* tRPC API route (`/api/trpc`)
* app-level providers for TanStack Query + tRPC client

Files:

```
src/server/api/trpc.ts
src/server/api/root.ts
src/server/api/routers/*
src/app/api/trpc/[trpc]/route.ts
src/app/providers.tsx
```

---

## 5) Add Zustand stores

Zustand has been introduced for client-only UI state.

Implemented:

* `src/stores/ui-store.ts` for sidebar UI state

Guideline remains:

* UI-only state in Zustand
* remote data in TanStack Query + tRPC

---

## 6) Add shadcn/ui

Implemented baseline:

* `button`
* `card`
* `input`

Current status:

* `dialog` is pending because adding `@radix-ui/react-dialog` is blocked by the current npm registry policy (`403 Forbidden`).

---

# 🚧 Next Steps

## 7) Supabase responsibilities

Supabase is responsible for:

* Managed PostgreSQL
* Authentication tables
* Optional storage
* Optional realtime

Prisma is responsible for:

* Application database access
* Typed queries
* Integration with tRPC and Auth.js

---

## 8) Vercel deployment checklist

* [ ] Set all environment variables in Vercel
* [ ] Confirm build runs `prisma generate` before `next build`
* [ ] Validate Auth.js callback URLs for production domain
* [ ] Deploy application