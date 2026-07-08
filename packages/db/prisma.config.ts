import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrate: {
    async url() {
      try { await import("dotenv/config"); } catch {}
      return process.env.DATABASE_URL ?? "";
    },
  },
});
