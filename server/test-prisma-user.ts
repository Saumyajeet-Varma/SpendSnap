
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const testUser = await prisma.user.create({
    data: {
      email: `prisma-test-${Date.now()}@example.com`,
      passwordHash: "test-only",
    },
  });

  console.log("Created user:", testUser);
  console.log("Generated ID:", JSON.stringify(testUser.id));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
