import path from "path";
import { readFileSync } from "fs";
import type { PrismaClient } from "@prisma/client";
import { config } from "../../src/config";
import { streamCsvGz } from "./stream-csv";
import { normalizeAmenities } from "./amenities";
import {
  scoreAspects,
  buildReviewSummary,
  aggregateAspectScores,
} from "./enrich";
import { getOpenAI, hasOpenAI } from "../../src/lib/openai";
import pLimit from "p-limit";

const CITY_NAMES: Record<string, string> = {
  lisbon: "Lisbon",
  barcelona: "Barcelona",
};

type ListingRow = Record<string, string>;

function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function estimateListingPrice(row: ListingRow): number {
  const parsed = parsePrice(row.price);
  if (parsed) return parsed;

  const bedrooms = parseInt(row.bedrooms ?? "1", 10) || 1;
  const accommodates = parseInt(row.accommodates ?? "2", 10) || 2;
  const room = (row.room_type ?? "").toLowerCase();
  let base = 55 + bedrooms * 18 + Math.min(accommodates, 6) * 6;
  if (room.includes("entire")) base *= 1.35;
  if (room.includes("hotel")) base *= 1.2;
  if (room.includes("private")) base *= 0.9;
  const idTail = parseInt(String(row.id).replace(/\D/g, "").slice(-5), 10) || 0;
  return Math.round(base + (idTail % 70));
}

function parsePhotos(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim().replace(/^"|"$/g, ""))
    .filter(Boolean)
    .slice(0, 8);
}

export async function loadCity(slug: string, prisma: PrismaClient): Promise<void> {
  const dir = path.join(config.ingest.dataDir, slug);
  const name = CITY_NAMES[slug] ?? slug;

  const city = await prisma.city.upsert({
    where: { slug },
    create: { slug, name, country: slug === "lisbon" ? "Portugal" : "Spain" },
    update: { name },
  });

  const listingIds = await prisma.listing.findMany({
    where: { cityId: city.id },
    select: { id: true },
  });
  const ids = listingIds.map((l) => l.id);
  if (ids.length) {
    await prisma.review.deleteMany({ where: { listingId: { in: ids } } });
    await prisma.calendarDay.deleteMany({ where: { listingId: { in: ids } } });
    await prisma.listing.deleteMany({ where: { cityId: city.id } });
  }

  const neighbourhoodMap = new Map<string, string>();
  const geoPath = path.join(dir, "neighbourhoods.geojson");
  try {
    const geo = JSON.parse(readFileSync(geoPath, "utf8")) as {
      features?: { properties?: { neighbourhood?: string; name?: string } }[];
    };
    for (const f of geo.features ?? []) {
      const n = f.properties?.neighbourhood ?? f.properties?.name;
      if (!n) continue;
      const nslug = n.toLowerCase().replace(/\s+/g, "-");
      const nb = await prisma.neighbourhood.upsert({
        where: { cityId_slug: { cityId: city.id, slug: nslug } },
        create: { cityId: city.id, name: n, slug: nslug, geojson: f.properties ?? {} },
        update: { name: n },
      });
      neighbourhoodMap.set(n.toLowerCase(), nb.id);
    }
  } catch {
    process.stdout.write(`No neighbourhoods for ${slug}\n`);
  }

  process.stdout.write(`Loading listings ${slug}...\n`);
  await streamCsvGz<ListingRow>(
    path.join(dir, "listings.csv.gz"),
    async () => {},
    config.ingest.listingBatchSize,
    async (rows) => {
      const data = rows
        .filter((r) => r.id && r.latitude && r.longitude)
        .map((r) => {
          const hood = (r.neighbourhood_cleansed ?? r.neighbourhood ?? "").toLowerCase();
          return {
            id: String(r.id),
            cityId: city.id,
            neighbourhoodId: neighbourhoodMap.get(hood) ?? null,
            name: r.name ?? `Listing ${r.id}`,
            description: r.description ?? null,
            propertyType: (r.property_type ?? "unknown").toLowerCase().replace(/\s+/g, "_"),
            roomType: (r.room_type ?? "unknown").toLowerCase().replace(/\s+/g, "_"),
            accommodates: parseInt(r.accommodates ?? "1", 10) || 1,
            bedrooms: r.bedrooms ? parseInt(r.bedrooms, 10) : null,
            beds: r.beds ? parseInt(r.beds, 10) : null,
            bathrooms: r.bathrooms ? parseFloat(r.bathrooms) : null,
            price: estimateListingPrice(r),
            latitude: parseFloat(r.latitude),
            longitude: parseFloat(r.longitude),
            amenities: normalizeAmenities(r.amenities ?? "[]"),
            photos: parsePhotos(r.picture_url ?? r.pictures),
            hostId: r.host_id ?? null,
            hostName: r.host_name ?? null,
            ratingAvg: r.review_scores_rating ? parseFloat(r.review_scores_rating) : null,
            reviewCount: parseInt(r.number_of_reviews ?? "0", 10) || 0,
            sourceUrl: r.listing_url ?? null,
          };
        });

      await prisma.listing.createMany({ data, skipDuplicates: true });
    }
  );

  process.stdout.write(`Loading calendar ${slug}...\n`);
  type CalRow = Record<string, string>;
  await streamCsvGz<CalRow>(
    path.join(dir, "calendar.csv.gz"),
    async () => {},
    config.ingest.calendarBatchSize,
    async (rows) => {
      const listingPrices = await prisma.listing.findMany({
        where: { cityId: city.id },
        select: { id: true, price: true },
      });
      const priceByListing = new Map(listingPrices.map((l) => [l.id, l.price]));

      const data = rows
        .filter((r) => r.listing_id && r.date)
        .map((r) => {
          const listingId = String(r.listing_id);
          const calendarPrice = parsePrice(r.price);
          const fallback = priceByListing.get(listingId) ?? 0;
          return {
            listingId,
            date: new Date(`${r.date}T00:00:00.000Z`),
            available: r.available === "t" || r.available === "true",
            price: calendarPrice ?? (fallback > 0 ? fallback : null),
          };
        });

      await prisma.calendarDay.createMany({ data, skipDuplicates: true });
    }
  );

  process.stdout.write(`Loading reviews ${slug}...\n`);
  const aspectByListing = new Map<string, Record<string, number>[]>();

  type ReviewRow = Record<string, string>;
  await streamCsvGz<ReviewRow>(
    path.join(dir, "reviews.csv.gz"),
    async () => {},
    config.ingest.reviewBatchSize,
    async (rows) => {
      const mapped = rows
        .filter((r) => r.listing_id && r.date)
        .map((r) => {
          const text = r.comments ?? "";
          const aspects = scoreAspects(text);
          const lid = String(r.listing_id);
          if (!aspectByListing.has(lid)) aspectByListing.set(lid, []);
          aspectByListing.get(lid)!.push(aspects);
          return {
            id: String(r.id),
            listingId: lid,
            date: new Date(`${r.date}T00:00:00.000Z`),
            reviewerId: r.reviewer_id ?? null,
            reviewerName: r.reviewer_name ?? null,
            rating: null,
            text: text || null,
            language: null,
            aspects,
          };
        });

      const listingIds = [...new Set(mapped.map((r) => r.listingId))];
      const existing = await prisma.listing.findMany({
        where: { id: { in: listingIds } },
        select: { id: true },
      });
      const existingSet = new Set(existing.map((e) => e.id));
      const data = mapped.filter((r) => existingSet.has(r.listingId));
      if (data.length) {
        await prisma.review.createMany({ data, skipDuplicates: true });
      }
    }
  );

  for (const [listingId, aspects] of aspectByListing) {
    const agg = aggregateAspectScores(aspects);
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) continue;
    const reviewSummary = buildReviewSummary(agg, listing.reviewCount);
    await prisma.listing.update({
      where: { id: listingId },
      data: { aspectScores: agg, reviewSummary },
    });
  }

  if (!config.ingest.skipEmbeddings && hasOpenAI()) {
    process.stdout.write(`Embedding sample listings ${slug}...\n`);
    const listings = await prisma.listing.findMany({
      where: { cityId: city.id },
      take: config.ingest.reviewEmbedSample,
      select: { id: true, name: true, description: true },
    });
    const openai = getOpenAI();
    const limit = pLimit(5);
    let embedded = 0;
    await Promise.all(
      listings.map((l) =>
        limit(async () => {
          const exists = await prisma.listing.findUnique({
            where: { id: l.id },
            select: { id: true },
          });
          if (!exists) return;

          try {
            const input = `${l.name}\n${l.description ?? ""}`.slice(0, 8000);
            const res = await openai.embeddings.create({
              model: config.openai.embeddingModel,
              input,
            });
            const vec = res.data[0]?.embedding;
            if (!vec) return;
            await prisma.listingEmbedding.upsert({
              where: { listingId: l.id },
              create: { listingId: l.id, embedding: vec },
              update: { embedding: vec },
            });
            embedded++;
          } catch {
            return;
          }
        })
      )
    );
    process.stdout.write(`Embedded ${embedded} listings for ${slug}\n`);
  }

  const count = await prisma.listing.count({ where: { cityId: city.id } });
  const reviewCount = await prisma.review.count({
    where: { listing: { cityId: city.id } },
  });
  process.stdout.write(`${slug}: ${count} listings, ${reviewCount} reviews\n`);
}
