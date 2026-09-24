# MealPilot

<p align="center">
  <img src="apps/mobile/assets/icon.png" width="150" alt="MealPilot">
</p>

AI-powered household meal planning assistant that generates weekly meal plans and turns them into an H‑E‑B grocery cart.

## Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Mobile    | React Native · Expo · TypeScript · Expo Router |
| Backend   | Node.js · Fastify · TypeScript          |
| Database  | Supabase (PostgreSQL + Auth)            |
| AI        | OpenAI (gpt-4o-mini)                    |
| Grocery   | H‑E‑B GraphQL (behind provider abstraction) |
| Hosting   | Render (API) · Expo (mobile)            |

## Monorepo Structure

```
mealpilot/
  apps/
    mobile/       ← Expo React Native app
    api/          ← Fastify backend
  packages/
    shared/       ← Shared TypeScript types
    heb/          ← H-E-B grocery provider abstraction
  supabase/
    migrations/   ← SQL migrations
```

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm
- Expo Go app on your iPhone (for mobile development)
- A Supabase project
- An OpenAI API key

### Setup

1. **Install dependencies**
   ```sh
   npm install
   ```

2. **Configure the API**
   ```sh
   cp apps/api/.env.example apps/api/.env
   # Fill in your real values
   ```

3. **Configure the mobile app**
   ```sh
   cp apps/mobile/.env.example apps/mobile/.env
   # Fill in your Supabase public URL and anon key
   ```

4. **Run the database migration**
   - Go to your Supabase project → SQL Editor
   - Paste and run `supabase/migrations/001_initial_schema.sql`

5. **Start the API**
   ```sh
   npm run api
   ```

6. **Start the mobile app**
   ```sh
   npm run mobile
   ```
   Scan the QR code with Expo Go.

## Available Scripts

| Command          | Description                 |
|------------------|-----------------------------|
| `npm run mobile` | Start Expo dev server       |
| `npm run api`    | Start Fastify dev server    |
| `npm run api:build` | Build the API for production |
| `npm run typecheck` | Typecheck all packages   |
