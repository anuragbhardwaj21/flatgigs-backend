import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { config } from "../../src/config";

const BASE_URL = "http://data.insideairbnb.com";

const FILES = [
  { name: "listings.csv.gz", dir: "data" },
  { name: "calendar.csv.gz", dir: "data" },
  { name: "reviews.csv.gz", dir: "data" },
  { name: "neighbourhoods.geojson", dir: "visualisations" },
] as const;

function forceDownload(): boolean {
  return process.env.FORCE_DOWNLOAD === "1" || process.env.FORCE_DOWNLOAD === "true";
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed ${res.status} ${url}`);
  }
  if (!res.body) {
    throw new Error(`Empty response body for ${url}`);
  }

  await mkdir(path.dirname(dest), { recursive: true });
  const nodeStream = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
  await pipeline(nodeStream, createWriteStream(dest));
}

async function downloadCity(slug: string): Promise<void> {
  const source = config.ingest.citySources[slug as keyof typeof config.ingest.citySources];
  if (!source) {
    throw new Error(`Unknown city slug: ${slug}`);
  }

  const cityDir = path.join(config.ingest.dataDir, slug);
  await mkdir(cityDir, { recursive: true });

  for (const file of FILES) {
    const dest = path.join(cityDir, file.name);
    if (!forceDownload() && (await fileExists(dest))) {
      process.stdout.write(`Skip (exists): ${dest}\n`);
      continue;
    }

    const url = `${BASE_URL}/${source.country}/${source.city}/${source.snapshot}/${file.dir}/${file.name}`;
    process.stdout.write(`Downloading ${url}\n`);
    await downloadFile(url, dest);
    process.stdout.write(`Saved ${dest}\n`);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const { access } = await import("fs/promises");
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  for (const slug of config.ingest.cities) {
    process.stdout.write(`\n==> Download ${slug}\n`);
    await downloadCity(slug);
  }
  process.stdout.write("\nDownload complete\n");
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : err}\n`);
  process.exit(1);
});
