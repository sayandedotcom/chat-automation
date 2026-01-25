import { prisma } from "../src/client.js";

async function main() {
  console.log("🌱 Starting database seed...");

  // Add your seed data here
  // Example:
  // const user = await prisma.user.upsert({
  //   where: { email: "dev@example.com" },
  //   update: {},
  //   create: {
  //     email: "dev@example.com",
  //     name: "Developer",
  //   },
  // });
  // console.log("Created user:", user);

  console.log("✅ Database seeding complete!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
