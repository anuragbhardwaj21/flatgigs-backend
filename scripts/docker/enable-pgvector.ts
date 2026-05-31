import { prisma } from "../../src/lib/prisma";

async function main() {
  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector;");
  process.stdout.write("pgvector extension enabled\n");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : err}\n`);
  await prisma.$disconnect();
  process.exit(1);
});
