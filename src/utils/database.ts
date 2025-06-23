import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

// Graceful shutdown
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});
