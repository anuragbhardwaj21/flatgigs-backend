import { config } from "../../src/config";
import { flushDataCaches } from "../../src/lib/cache";
import { ensureRedis } from "../../src/lib/redis";
import { prisma } from "../../src/lib/prisma";
import { loadCity } from "./load-city";

async function main() {
  for (const slug of config.ingest.cities) {
    await loadCity(slug, prisma);
  }

  const listings = await prisma.listing.count();
  const reviews = await prisma.review.count();
  process.stdout.write(`Done: ${listings} listings, ${reviews} reviews\n`);

  await ensureRedis();
  const flushed = await flushDataCaches();
  process.stdout.write(`Flushed ${flushed} Redis cache keys\n`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : err}\n`);
  await prisma.$disconnect();
  process.exit(1);
});
