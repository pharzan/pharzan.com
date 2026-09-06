#!/usr/bin/env -S pnpm exec tsx

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  GENERATED_SCHEMA_COMMENT,
  GeneratedPodcastSchemas,
} from "./podcast/schemas/index.ts";

const outputDirectory = path.resolve("schemas/podcast/v1");
const check = process.argv.slice(2).includes("--check");

function render(schema: object): string {
  return `${JSON.stringify({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $comment: GENERATED_SCHEMA_COMMENT,
    ...schema,
  }, null, 2)}\n`;
}

async function main(): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  const stale: string[] = [];
  for (const [filename, schema] of Object.entries(GeneratedPodcastSchemas)) {
    const destination = path.join(outputDirectory, filename);
    const expected = render(schema);
    if (check) {
      const current = await readFile(destination, "utf8").catch(() => "");
      if (current !== expected) stale.push(filename);
      continue;
    }
    const temporary = `${destination}.${process.pid}.tmp`;
    await writeFile(temporary, expected);
    await rename(temporary, destination);
  }
  if (stale.length) {
    throw new Error(`Generated podcast schemas are stale: ${stale.join(", ")}. Run pnpm schemas:podcast.`);
  }
  console.log(check ? "Podcast schemas are current." : "Podcast schemas generated.");
}

await main();
