import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer auto-loads env files. Locally the secrets live in
// .env.local; on Vercel they come from the platform environment.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (e.g. Vercel build) — platform env is already populated.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migration/introspection commands need the direct (session-mode)
    // connection, not the pgbouncer transaction pooler.
    url: env("DIRECT_URL"),
  },
});
