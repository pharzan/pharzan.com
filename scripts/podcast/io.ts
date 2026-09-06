import { createHash } from "node:crypto";
import { access, mkdir, open, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { PodcastError } from "./domain.ts";

export const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function exists(filename: string): Promise<boolean> {
  try { await access(filename); return true; } catch { return false; }
}

export async function atomicWrite(filename: string, data: string | Buffer): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  await writeFile(temporary, data, { mode: 0o600 });
  await rename(temporary, filename);
}

export async function readYaml<T>(filename: string): Promise<T> {
  try {
    return YAML.parse(await readFile(filename, "utf8")) as T;
  } catch (error) {
    throw new PodcastError(`Cannot read YAML ${filename}: ${(error as Error).message}`, "INTEGRITY");
  }
}

export async function writeYaml(filename: string, value: unknown): Promise<void> {
  await atomicWrite(filename, YAML.stringify(value, { lineWidth: 100 }));
}

export async function appendJsonLine(filename: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  const handle = await open(filename, "a", 0o600);
  try { await handle.writeFile(`${JSON.stringify(value)}\n`); await handle.sync(); }
  finally { await handle.close(); }
}

export async function resolveWithin(root: string, candidate: string): Promise<string> {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new PodcastError(`Path escapes allowed root: ${candidate}`);
  }
  return resolved;
}

export async function resolveInputFile(candidate: string): Promise<string> {
  if (candidate === "-" || /^https?:\/\//i.test(candidate)) {
    throw new PodcastError("Draft input must be a local UTF-8 .md or .txt file.");
  }
  const absolute = await realpath(path.resolve(candidate)).catch(() => {
    throw new PodcastError(`Draft does not exist: ${candidate}`);
  });
  const info = await stat(absolute);
  if (!info.isFile() || ![".md", ".txt"].includes(path.extname(absolute).toLowerCase())) {
    throw new PodcastError("Draft input must be a UTF-8 .md or .txt file.");
  }
  const content = await readFile(absolute, "utf8");
  if (content.includes("\uFFFD")) throw new PodcastError("Draft is not valid UTF-8.");
  return absolute;
}

export async function withEpisodeLock<T>(episodeRoot: string, command: string, operation: () => Promise<T>): Promise<T> {
  const filename = path.join(episodeRoot, ".work", "lock");
  await mkdir(path.dirname(filename), { recursive: true });
  let handle;
  try {
    handle = await open(filename, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new PodcastError(`Episode is locked (${filename}).`, "BLOCKED", `pnpm podcast doctor ${path.basename(episodeRoot)}`);
    }
    throw error;
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, host: process.env.HOSTNAME ?? "unknown", command, at: new Date().toISOString() }));
    await handle.sync();
    return await operation();
  } finally {
    await handle.close();
    await unlink(filename).catch(() => undefined);
  }
}
