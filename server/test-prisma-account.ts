
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is missing");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const user = await prisma.user.findFirst();

  if (!user) {
    throw new Error("No user found. Create a user first.");
  }

  const account = await prisma.account.create({
    data: {
      name: `Test Cash ${Date.now()}`,
      type: "CASH",
      currency: "INR",
      openingBalance: 0,
      userId: user.id,
    },
  });

  console.log("Created account:", account);
  console.log("Account ID:", account.id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
