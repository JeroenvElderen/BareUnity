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

# 🚧 Next Steps

## 4) Configure tRPC

tRPC will provide a fully typed API layer between Next.js and Prisma.

Tasks:

### 4.1 Create server router

Create the following files:

```
src/server/api/trpc.ts
src/server/api/root.ts
```

These define:

* base router
* procedures
* context setup

---

### 4.2 Add context

Context should include:

* Prisma client
* Auth.js session

Example flow:

```
request → auth session → Prisma queries
```

---

### 4.3 Add tRPC API route

Create:

```
src/app/api/trpc/[trpc]/route.ts
```

This exposes the tRPC API endpoint.

---

### 4.4 Add client provider

Create:

```
src/app/providers.tsx
```

Add:

* TanStack Query client
* tRPC client

Wrap the application layout with this provider.

---

## 5) Add Zustand stores

Create domain stores under:

```
src/stores/*
```

Use Zustand for **client-side UI state only**.

Examples:

* modal state
* navigation state
* UI preferences

Remote data should remain handled by **TanStack Query + tRPC**.

---

## 6) Add shadcn/ui

Initialize the component system:

```bash
npx shadcn@latest init
```

Add baseline components as needed:

```
button
card
input
dialog
```

Replace custom UI primitives with shadcn components.

---

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

---

# Remaining rollout order

1. Configure tRPC endpoints
2. Add TanStack Query + tRPC client provider
3. Add Zustand stores
4. Initialize shadcn/ui
5. Deploy to Vercel
