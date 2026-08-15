#!/usr/bin/env -S pnpm exec tsx

import { GoogleGenAI } from "@google/genai";
import matter from "gray-matter";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import remarkParse from "remark-parse";
import { unified } from "unified";

export const MODEL = "gemini-2.5-pro-tts";
export const VOICE = "Orus";
export const VERTEX_LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? "global";
export const MAX_CHUNK_CHARACTERS = 5_000;
export const PAUSE_MILLISECONDS = 400;
export const MP3_BITRATE = "64k";
export const SAMPLE_RATE = 24_000;
export const CACHE_VERSION = 1;

export const NARRATION_PROMPT = `
Speak the article in its original language as if the author is explaining their
ideas directly to one friend in a relaxed conversation.

Use natural spoken pronunciation, an informal but thoughtful cadence, varied
sentence rhythm, and brief pauses between ideas. Sound warm, confident, and
unhurried.

Preserve the meaning and structure, but adapt formal written constructions into
idiomatic speech when needed. Do not summarize, introduce, conclude, comment
on, or add ideas. Avoid an audiobook, literary recitation, lecture, newsreader,
theatrical, ceremonial, overly enthusiastic, or sales-oriented tone.
`.trim();

export const ENGLISH_CONVERSATIONAL_PROMPT = `
Speak the article in natural, contemporary English, as if the author is
explaining their ideas directly to one friend in a relaxed conversation.

Use an informal but thoughtful cadence, natural spoken pronunciation and
contractions, varied sentence rhythm, and brief pauses between ideas. Keep the
delivery warm, confident, and unhurried.

Preserve the meaning and structure, but adapt formal written constructions into
idiomatic spoken English when needed. Do not summarize, introduce, conclude,
comment on, or add ideas. Avoid an audiobook, literary recitation, lecture,
newsreader, theatrical, ceremonial, overly enthusiastic, or sales-oriented tone.
`.trim();

export const PERSIAN_CONVERSATIONAL_PROMPT = `
Speak the article in natural, contemporary Iranian Persian, as if the author is
explaining their ideas directly to one friend in a relaxed conversation.

Use an informal but thoughtful cadence, natural spoken pronunciation,
contractions, and varied sentence rhythm where appropriate. Keep the delivery
warm, confident, and unhurried, with brief natural pauses between ideas.

Preserve the meaning and structure of the article, but adapt formal written
constructions into idiomatic spoken Persian when needed. Do not summarize,
introduce, conclude, comment on, or add ideas. Avoid an audiobook, literary
recitation, lecture, newsreader, theatrical, or ceremonial tone.
`.trim();

export const TURKISH_CONVERSATIONAL_PROMPT = `
Speak the article in natural, contemporary Turkish as spoken in Turkey, as if
the author is explaining their ideas directly to one friend in a relaxed
conversation.

Use an informal but thoughtful cadence, natural spoken pronunciation and
phrasing, varied sentence rhythm, and brief pauses between ideas. Keep the
delivery warm, confident, and unhurried.

Preserve the meaning and structure, but adapt formal written constructions into
idiomatic spoken Turkish when needed. Do not summarize, introduce, conclude,
comment on, or add ideas. Avoid an audiobook, literary recitation, lecture,
newsreader, theatrical, ceremonial, overly enthusiastic, or sales-oriented tone.
`.trim();

const PRICING = {
  currency: "USD",
  inputPerMillionTokens: 1,
  outputPerMillionTokens: 20,
} as const;

type MarkdownNode = {
  type: string;
  depth?: number;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
};

type ChunkUsage = {
  index: number;
  hash: string;
  status: "completed" | "reused";
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  usageSource: "api" | "estimated";
  reusedFromGenerationId?: string;
};

type Generation = {
  id: string;
  startedAt: string;
  completedAt?: string;
  contentHash: string;
  model: string;
  voice: string;
  provider: "vertex-ai";
  project: string;
  location: string;
  prompt: string;
  pricing: typeof PRICING;
  status: "running" | "failed" | "completed";
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  chunks: ChunkUsage[];
  error?: string;
};

type AudioManifest = {
  version: number;
  source: string;
  output: string;
  currentHash?: string;
  generations: Generation[];
};

function inlineText(node: MarkdownNode): string {
  if (node.type === "image" || node.type === "imageReference") return "";
  if (node.type === "html" || node.type === "footnoteDefinition") return "";

  if (node.type === "text") {
    return node.value ?? "";
  }

  if (node.type === "inlineCode") return ` ${node.value ?? ""} `;

  if (node.type === "break") return ". ";

  if (node.type === "link" || node.type === "linkReference") {
    const label = (node.children ?? []).map(inlineText).join("").trim();
    return /^https?:\/\//i.test(label) ? "" : label;
  }

  return (node.children ?? []).map(inlineText).join("");
}

function blockText(node: MarkdownNode): string[] {
  switch (node.type) {
    case "heading":
    case "paragraph": {
      const text = inlineText(node).trim();
      return text ? [text] : [];
    }
    case "code":
    case "html":
    case "definition":
    case "thematicBreak":
    case "yaml":
      return [];
    default:
      return (node.children ?? []).flatMap(blockText);
  }
}

function normalizeSpokenText(value: string): string {
  return value
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function comparableTitle(value: string): string {
  return value.toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function markdownToNarration(markdown: string): string {
  const parsed = matter(markdown);
  const tree = unified().use(remarkParse).parse(parsed.content) as MarkdownNode;
  const blocks = blockText(tree)
    .map(normalizeSpokenText)
    .filter(Boolean);

  const title = typeof parsed.data.title === "string"
    ? normalizeSpokenText(parsed.data.title)
    : "";
  const firstNarratableNode = tree.children?.find((node) =>
    blockText(node).length > 0
  );
  const beginsWithTitleHeading = firstNarratableNode?.type === "heading" &&
    firstNarratableNode.depth === 1;

  if (
    title &&
    !beginsWithTitleHeading &&
    (!blocks[0] || comparableTitle(blocks[0]) !== comparableTitle(title))
  ) {
    blocks.unshift(title);
  }

  return blocks.join("\n\n");
}

function splitOversizedBlock(block: string, maximum: number): string[] {
  if (block.length <= maximum) return [block];

  const sentences = block.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [block];
  const pieces: string[] = [];
  let current = "";

  for (const sentenceValue of sentences) {
    const sentence = sentenceValue.trim();
    if (!sentence) continue;

    if (sentence.length > maximum) {
      if (current) {
        pieces.push(current);
        current = "";
      }

      const words = sentence.split(/\s+/);
      let wordChunk = "";
      for (const word of words) {
        if (word.length > maximum) {
          if (wordChunk) pieces.push(wordChunk);
          pieces.push(...word.match(new RegExp(`.{1,${maximum}}`, "g"))!);
          wordChunk = "";
        } else if (!wordChunk) {
          wordChunk = word;
        } else if (`${wordChunk} ${word}`.length <= maximum) {
          wordChunk += ` ${word}`;
        } else {
          pieces.push(wordChunk);
          wordChunk = word;
        }
      }
      if (wordChunk) pieces.push(wordChunk);
      continue;
    }

    if (!current) {
      current = sentence;
    } else if (`${current} ${sentence}`.length <= maximum) {
      current += ` ${sentence}`;
    } else {
      pieces.push(current);
      current = sentence;
    }
  }

  if (current) pieces.push(current);
  return pieces;
}

export function chunkNarration(
  narration: string,
  maximum = MAX_CHUNK_CHARACTERS,
): string[] {
  if (!Number.isInteger(maximum) || maximum < 1) {
    throw new Error("Chunk size must be a positive integer.");
  }

  const blocks = narration
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => splitOversizedBlock(block, maximum));

  const chunks: string[] = [];
  let current = "";

  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length <= maximum) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      current = block;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export function calculateCost(
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    inputTokens * PRICING.inputPerMillionTokens / 1_000_000 +
    outputTokens * PRICING.outputPerMillionTokens / 1_000_000
  );
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function narrationPromptForLanguage(language: unknown): string {
  if (typeof language !== "string") return ENGLISH_CONVERSATIONAL_PROMPT;
  try {
    switch (new Intl.Locale(language).language) {
      case "en":
        return ENGLISH_CONVERSATIONAL_PROMPT;
      case "fa":
        return PERSIAN_CONVERSATIONAL_PROMPT;
      case "tr":
        return TURKISH_CONVERSATIONAL_PROMPT;
      default:
        return NARRATION_PROMPT;
    }
  } catch {
    return NARRATION_PROMPT;
  }
}

function contentHash(narration: string, prompt: string): string {
  return sha256(JSON.stringify({
    cacheVersion: CACHE_VERSION,
    narration,
    prompt,
    model: MODEL,
    voice: VOICE,
    maximumChunkCharacters: MAX_CHUNK_CHARACTERS,
    pauseMilliseconds: PAUSE_MILLISECONDS,
    mp3Bitrate: MP3_BITRATE,
    sampleRate: SAMPLE_RATE,
  }));
}

function writeWav(filename: string, pcm: Buffer): Promise<void> {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return writeFile(filename, Buffer.concat([header, pcm]));
}

async function writeManifest(
  filename: string,
  manifest: AudioManifest,
): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(temporary, filename);
}

async function fileExists(filename: string): Promise<boolean> {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

async function readManifest(
  filename: string,
  source: string,
  output: string,
): Promise<AudioManifest> {
  try {
    const value = JSON.parse(await readFile(filename, "utf8")) as AudioManifest;
    if (value.version !== CACHE_VERSION || !Array.isArray(value.generations)) {
      throw new Error("unsupported cache format");
    }
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(`Cannot read ${filename}: ${(error as Error).message}`);
    }
    return { version: CACHE_VERSION, source, output, generations: [] };
  }
}

function pcmDurationSeconds(pcm: Buffer): number {
  return pcm.length / (SAMPLE_RATE * 2);
}

function usageFromResponse(
  response: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>,
  pcm: Buffer,
  input: string,
): Omit<ChunkUsage, "index" | "hash" | "status"> {
  const inputTokens = response.usageMetadata?.promptTokenCount;
  const outputTokens = response.usageMetadata?.candidatesTokenCount;
  const usedApiMetadata = inputTokens !== undefined &&
    outputTokens !== undefined;
  const resolvedInputTokens = inputTokens ?? Math.ceil(input.length / 4);
  const resolvedOutputTokens = outputTokens ??
    Math.ceil(pcmDurationSeconds(pcm) * 25);

  return {
    inputTokens: resolvedInputTokens,
    outputTokens: resolvedOutputTokens,
    estimatedUsd: calculateCost(resolvedInputTokens, resolvedOutputTokens),
    usageSource: usedApiMetadata ? "api" : "estimated",
  };
}

function statusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as { status?: unknown; code?: unknown };
  const candidate = value.status ?? value.code;
  if (typeof candidate === "number") return candidate;
  if (typeof candidate === "string" && /^\d{3}$/.test(candidate)) {
    return Number(candidate);
  }
  return undefined;
}

export function isRetryableError(error: unknown): boolean {
  return [429, 500, 502, 503, 504].includes(statusCode(error) ?? 0);
}

async function withRetries<T>(operation: () => Promise<T>): Promise<T> {
  const maximumRetries = 3;
  for (let attempt = 0;; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableError(error) || attempt >= maximumRetries) throw error;
      const delay = 1_000 * 2 ** attempt;
      console.warn(`  Temporary API error; retrying in ${delay / 1_000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function generateChunk(
  ai: GoogleGenAI,
  text: string,
  prompt: string,
): Promise<
  { pcm: Buffer; usage: Omit<ChunkUsage, "index" | "hash" | "status"> }
> {
  const input = `${prompt}\n\n<article>\n${text}\n</article>`;
  const response = await withRetries(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: input,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: VOICE },
          },
        },
      },
    })
  );

  const part = response.candidates?.[0]?.content?.parts?.find(
    (candidate) => candidate.inlineData?.data,
  );
  const encodedAudio = part?.inlineData?.data;
  if (!encodedAudio) throw new Error("Gemini returned no audio data.");

  const pcm = Buffer.from(encodedAudio, "base64");
  return { pcm, usage: usageFromResponse(response, pcm, input) };
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (process.platform === "win32") {
      reject(new Error("Windows is not currently supported."));
      return;
    }

    const running = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    running.stderr.on("data", (data: Buffer) => stderr += data.toString());
    running.on("error", reject);
    running.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${code}): ${stderr.trim()}`));
    });
  });
}

async function commandOutput(command: string, args: string[]): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const running = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    running.stdout.on("data", (data: Buffer) => stdout += data.toString());
    running.stderr.on("data", (data: Buffer) => stderr += data.toString());
    running.on("error", reject);
    running.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${command} failed (${code}): ${stderr.trim()}`));
    });
  });
}

async function resolveGoogleCloudProject(): Promise<string> {
  const configured = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (configured) return configured;

  try {
    const project = await commandOutput("gcloud", [
      "config",
      "get-value",
      "project",
      "--quiet",
    ]);
    if (project && project !== "(unset)") return project;
  } catch {
    // The actionable error below covers a missing CLI and an unset project.
  }

  throw new Error(
    "No Google Cloud project found. Set GOOGLE_CLOUD_PROJECT or run `gcloud config set project PROJECT_ID`.",
  );
}

async function ensureFfmpeg(): Promise<void> {
  try {
    await runCommand("ffmpeg", ["-version"]);
  } catch {
    throw new Error("ffmpeg is required but was not found on PATH.");
  }
}

function escapeConcatPath(filename: string): string {
  return filename.replaceAll("'", "'\\''");
}

async function assembleMp3(
  chunkFiles: string[],
  workDirectory: string,
  output: string,
): Promise<void> {
  const silence = path.join(workDirectory, "silence.wav");
  const silenceSamples = Math.round(SAMPLE_RATE * PAUSE_MILLISECONDS / 1_000);
  await writeWav(silence, Buffer.alloc(silenceSamples * 2));

  const sequence = chunkFiles.flatMap((file, index) =>
    index === chunkFiles.length - 1 ? [file] : [file, silence]
  );
  const concatFile = path.join(workDirectory, "concat.txt");
  await writeFile(
    concatFile,
    sequence.map((file) => `file '${escapeConcatPath(path.resolve(file))}'`)
      .join("\n") + "\n",
  );

  await mkdir(path.dirname(output), { recursive: true });
  const temporaryOutput = `${output}.${process.pid}.tmp.mp3`;
  await runCommand("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatFile,
    "-ac",
    "1",
    "-ar",
    String(SAMPLE_RATE),
    "-codec:a",
    "libmp3lame",
    "-b:a",
    MP3_BITRATE,
    temporaryOutput,
  ]);
  await rename(temporaryOutput, output);
}

function sumGeneration(generation: Generation): void {
  generation.inputTokens = generation.chunks.reduce(
    (sum, chunk) => sum + chunk.inputTokens,
    0,
  );
  generation.outputTokens = generation.chunks.reduce(
    (sum, chunk) => sum + chunk.outputTokens,
    0,
  );
  generation.estimatedUsd = generation.chunks.reduce(
    (sum, chunk) => sum + chunk.estimatedUsd,
    0,
  );
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
  }).format(value);
}

async function recordedTotal(directory: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }

  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "chunks") total += await recordedTotal(filename);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      const manifest = JSON.parse(
        await readFile(filename, "utf8"),
      ) as AudioManifest;
      total += manifest.generations.reduce(
        (sum, generation) => sum + generation.estimatedUsd,
        0,
      );
    }
  }
  return total;
}

async function resolveInput(inputArgument: string): Promise<{
  absolute: string;
  relative: string;
  relativeWithoutExtension: string;
}> {
  const postsDirectory = await realpath(path.resolve("posts"));
  const absolute = await realpath(path.resolve(inputArgument));
  const relative = path.relative(postsDirectory, absolute);

  if (
    !relative || relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative) ||
    path.extname(relative).toLowerCase() !== ".md"
  ) {
    throw new Error("Input must be a Markdown file inside posts/.");
  }

  return {
    absolute,
    relative: path.posix.join(
      "posts",
      relative.split(path.sep).join(path.posix.sep),
    ),
    relativeWithoutExtension: relative.slice(0, -path.extname(relative).length),
  };
}

function parseArguments(args: string[]): { input: string; force: boolean } {
  const force = args.includes("--force");
  const positional = args.filter((argument) => argument !== "--force");
  if (positional.length !== 1) {
    throw new Error("Usage: pnpm generate-audio <posts/file.md> [--force]");
  }
  return { input: positional[0], force };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { input, force } = parseArguments(args);
  const project = await resolveGoogleCloudProject();
  await ensureFfmpeg();
  const source = await resolveInput(input);
  const markdown = await readFile(source.absolute, "utf8");
  const parsedPost = matter(markdown);
  const narrationPrompt = narrationPromptForLanguage(parsedPost.data.lang);
  const narration = markdownToNarration(markdown);
  if (!narration) throw new Error("The Markdown file has no narratable text.");

  const hash = contentHash(narration, narrationPrompt);
  const relativeOutput = path.posix.join(
    "assets/audio",
    `${
      source.relativeWithoutExtension.split(path.sep).join(path.posix.sep)
    }.mp3`,
  );
  const output = path.resolve(relativeOutput);
  const manifestPath = path.resolve(
    ".audio-cache",
    `${source.relativeWithoutExtension}.json`,
  );
  const manifest = await readManifest(
    manifestPath,
    source.relative,
    relativeOutput,
  );

  if (!force && manifest.currentHash === hash && await fileExists(output)) {
    const lifetime = manifest.generations.reduce(
      (sum, generation) => sum + generation.estimatedUsd,
      0,
    );
    console.log(`Audio is current: ${relativeOutput}`);
    console.log(`Recorded spend for this article: ${formatUsd(lifetime)}`);
    console.log(
      `Recorded spend across all articles: ${
        formatUsd(await recordedTotal(path.resolve(".audio-cache")))
      }`,
    );
    return;
  }

  const chunks = chunkNarration(narration);
  const workDirectory = path.resolve(
    ".audio-cache/chunks",
    source.relativeWithoutExtension,
    hash,
  );
  await mkdir(workDirectory, { recursive: true });

  const resumeSource = !force
    ? [...manifest.generations].reverse().find((candidate) =>
      candidate.contentHash === hash && candidate.status !== "completed"
    )
    : undefined;

  if (resumeSource?.status === "running") {
    resumeSource.status = "failed";
    resumeSource.completedAt = new Date().toISOString();
    resumeSource.error =
      "Interrupted before completion; a later run resumed available chunks.";
  }

  const generation: Generation = {
    id: randomUUID(),
    startedAt: new Date().toISOString(),
    contentHash: hash,
    model: MODEL,
    voice: VOICE,
    provider: "vertex-ai",
    project,
    location: VERTEX_LOCATION,
    prompt: narrationPrompt,
    pricing: PRICING,
    status: "running",
    inputTokens: 0,
    outputTokens: 0,
    estimatedUsd: 0,
    chunks: [],
  };
  manifest.generations.push(generation);
  await writeManifest(manifestPath, manifest);

  const ai = new GoogleGenAI({
    vertexai: true,
    project,
    location: VERTEX_LOCATION,
  });
  const chunkFiles: string[] = [];

  try {
    for (const [index, chunk] of chunks.entries()) {
      const chunkHash = sha256(chunk);
      const chunkFile = path.join(
        workDirectory,
        `chunk-${String(index + 1).padStart(3, "0")}.wav`,
      );
      chunkFiles.push(chunkFile);
      const recorded = resumeSource?.chunks.find(
        (candidate) =>
          candidate.index === index && candidate.hash === chunkHash,
      );
      if (recorded && await fileExists(chunkFile)) {
        console.log(`Reusing chunk ${index + 1}/${chunks.length}`);
        generation.chunks.push({
          index,
          hash: chunkHash,
          status: "reused",
          inputTokens: 0,
          outputTokens: 0,
          estimatedUsd: 0,
          usageSource: recorded.usageSource,
          reusedFromGenerationId: resumeSource!.id,
        });
        await writeManifest(manifestPath, manifest);
        continue;
      }

      console.log(`Generating chunk ${index + 1}/${chunks.length}...`);
      const result = await generateChunk(ai, chunk, narrationPrompt);
      generation.chunks = generation.chunks.filter((candidate) =>
        candidate.index !== index
      );
      generation.chunks.push({
        index,
        hash: chunkHash,
        status: "completed",
        ...result.usage,
      });
      generation.chunks.sort((left, right) => left.index - right.index);
      sumGeneration(generation);
      await writeManifest(manifestPath, manifest);
      await writeWav(chunkFile, result.pcm);
    }

    console.log("Joining chunks and compressing MP3...");
    await assembleMp3(chunkFiles, workDirectory, output);
    generation.status = "completed";
    generation.completedAt = new Date().toISOString();
    manifest.currentHash = hash;
    manifest.output = relativeOutput;
    await writeManifest(manifestPath, manifest);
    await rm(workDirectory, { recursive: true, force: true });
  } catch (error) {
    generation.status = "failed";
    generation.completedAt = new Date().toISOString();
    generation.error = error instanceof Error ? error.message : String(error);
    sumGeneration(generation);
    await writeManifest(manifestPath, manifest);
    throw error;
  }

  const articleTotal = manifest.generations.reduce(
    (sum, item) => sum + item.estimatedUsd,
    0,
  );
  console.log(`Created ${relativeOutput}`);
  console.log(`This generation: ${formatUsd(generation.estimatedUsd)}`);
  console.log(`Recorded spend for this article: ${formatUsd(articleTotal)}`);
  console.log(
    `Recorded spend across all articles: ${
      formatUsd(await recordedTotal(path.resolve(".audio-cache")))
    }`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
