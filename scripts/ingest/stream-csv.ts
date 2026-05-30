import { createReadStream } from "fs";
import { createGunzip } from "zlib";
import { parse } from "csv-parse";

export async function streamCsvGz<T>(
  filePath: string,
  onRow: (row: T) => Promise<void> | void,
  batchSize = 1000,
  onBatch?: (rows: T[]) => Promise<void>
): Promise<number> {
  let count = 0;
  let batch: T[] = [];

  const parser = createReadStream(filePath)
    .pipe(createGunzip())
    .pipe(
      parse({
        columns: true,
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
      })
    );

  for await (const row of parser) {
    batch.push(row as T);
    count++;
    if (batch.length >= batchSize) {
      if (onBatch) await onBatch(batch);
      else {
        for (const r of batch) await onRow(r);
      }
      batch = [];
    }
  }

  if (batch.length) {
    if (onBatch) await onBatch(batch);
    else {
      for (const r of batch) await onRow(r);
    }
  }

  return count;
}
