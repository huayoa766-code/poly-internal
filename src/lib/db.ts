import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot reloads in dev to avoid exhausting
// connections. https://pris.ly/d/help/next-js-best-practices
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
