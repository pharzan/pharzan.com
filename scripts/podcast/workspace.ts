import { mkdir, readFile, readdir, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { DerivedState, EpisodeConfig, EventRecord, PASS_ORDER, PassId, PodcastError } from "./domain.ts";
import { appendJsonLine, atomicWrite, exists, readYaml, resolveInputFile, sha256, writeYaml } from "./io.ts";
import type { RepositoryConfig } from "./schemas/index.ts";
import { assertSchema } from "./validation.ts";
export type { RepositoryConfig } from "./schemas/index.ts";

export type EpisodeContext = {
  repositoryRoot: string;
  repository: RepositoryConfig;
  root: string;
  work: string;
  config: EpisodeConfig;
};

export function validateSlug(slug: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new PodcastError("Episode slug must use lowercase words separated by hyphens.");
}

export async function repositoryRoot(start = process.cwd()): Promise<string> {
  let current = await realpath(start);
  for (;;) {
    if (await exists(path.join(current, "podcast.config.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new PodcastError("Cannot find podcast.config.yaml.");
    current = parent;
  }
}

export async function loadRepository(start = process.cwd()): Promise<{ root: string; config: RepositoryConfig }> {
  const root = await repositoryRoot(start);
  const config = await readYaml<RepositoryConfig>(path.join(root, "podcast.config.yaml"));
  await assertSchema(root, "repository-config.schema.json", config);
  return { root, config };
}

export async function episodeContext(slug: string): Promise<EpisodeContext> {
  validateSlug(slug);
  const { root: repositoryRoot, config: repository } = await loadRepository();
  const root = path.join(repositoryRoot, repository.podcasts_root, slug);
  if (!await exists(path.join(root, "episode.yaml"))) throw new PodcastError(`Unknown episode: ${slug}`);
  const config = await readYaml<EpisodeConfig>(path.join(root, "episode.yaml"));
  await assertSchema(repositoryRoot, "episode.schema.json", config);
  if (config.schema_version !== 1 || config.slug !== slug) throw new PodcastError("Episode schema or slug is invalid.", "INTEGRITY");
  const source = await readFile(path.join(root, "source.md"), "utf8").catch(() => { throw new PodcastError("Immutable source.md is missing.", "INTEGRITY"); });
  if (sha256(source) !== config.source_sha256) throw new PodcastError("Immutable source.md hash no longer matches episode.yaml.", "INTEGRITY");
  return { repositoryRoot, repository, root, work: path.join(root, ".work"), config };
}

export async function appendEvent(context: EpisodeContext, event: Omit<EventRecord, "schema_version" | "sequence" | "at" | "episode">): Promise<EventRecord> {
  const current = await events(context);
  const record: EventRecord = { schema_version: 1, sequence: current.length + 1, at: new Date().toISOString(), episode: context.config.slug, ...event };
  await appendJsonLine(path.join(context.work, "history.jsonl"), record);
  await atomicWrite(path.join(context.work, "state.json"), `${JSON.stringify(replay(context.config.slug, [...current, record]), null, 2)}\n`);
  return record;
}

export async function events(context: EpisodeContext): Promise<EventRecord[]> {
  const filename = path.join(context.work, "history.jsonl");
  if (!await exists(filename)) return [];
  const text = await readFile(filename, "utf8");
  return text.split("\n").filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) as EventRecord; }
    catch { throw new PodcastError(`Invalid history event at line ${index + 1}.`, "INTEGRITY"); }
  });
}

export function replay(slug: string, history: EventRecord[]): DerivedState {
  const state: DerivedState = { schema_version: 1, episode: slug, phase: "created", events: history.length };
  for (const event of history) {
    if (event.action === "pass_generated") {
      state.phase = "pass_review"; state.current_pass = event.pass; state.candidate_path = String(event.details?.candidate_path); state.candidate_sha256 = event.output_sha256;
    } else if (event.action === "pass_approved") state.phase = "pass_approved";
    else if (event.action === "script_approved") { state.phase = "script_approved"; state.approved_script_sha256 = event.output_sha256; }
    else if (event.action === "audio_planned") { state.phase = "audio_planned"; state.audio_plan_sha256 = event.output_sha256; }
    else if (event.action === "audio_generated") state.phase = "audio_scene_review";
    else if (event.action === "audio_assembled") state.phase = "audio_assembled";
    else if (event.action === "audio_approved") state.phase = "audio_approved";
  }
  return state;
}

export async function createEpisode(
  slug: string,
  sourceArg: string,
  template: string,
  locale: string,
  dryRun: boolean,
  overrides: Partial<RepositoryConfig["provider"]> & { host_voice?: string; guest_voice?: string } = {},
): Promise<Record<string, unknown>> {
  validateSlug(slug);
  if (template !== "interview@0.1.0") throw new PodcastError("V1 supports template interview@0.1.0 only.");
  if (locale !== "en-US") throw new PodcastError("V1 includes only the reviewed en-US locale pack.");
  const source = await resolveInputFile(sourceArg);
  const sourceText = await readFile(source, "utf8");
  if (!sourceText.trim()) throw new PodcastError("Draft is empty.");
  const { root: repositoryRoot, config: repository } = await loadRepository();
  const root = path.join(repositoryRoot, repository.podcasts_root, slug);
  if (await exists(root)) throw new PodcastError(`Episode already exists: ${slug}`);
  const result = { episode: slug, source, destination: root, source_sha256: sha256(sourceText), dry_run: dryRun };
  if (dryRun) return result;

  const staging = path.join(repositoryRoot, repository.podcasts_root, `.${slug}.create-${process.pid}`);
  if (await exists(staging)) throw new PodcastError(`Stale create staging directory exists: ${staging}`, "INTEGRITY");
  await mkdir(path.join(staging, ".work"), { recursive: true });
  try {
  await atomicWrite(path.join(staging, "source.md"), sourceText);
  const config: EpisodeConfig = {
    schema_version: 1, slug, created_at: new Date().toISOString(), template: "interview@0.1.0", locale, source_sha256: sha256(sourceText),
    roles: { host: { display_name: "Host", voice: overrides.host_voice ?? repository.audio.host_voice }, guest: { display_name: "Guest", voice: overrides.guest_voice ?? repository.audio.guest_voice } },
    provider: {
      project: overrides.project === undefined ? repository.provider.project : overrides.project,
      location: overrides.location ?? repository.provider.location,
      editing_model: overrides.editing_model ?? repository.provider.editing_model,
      tts_model: overrides.tts_model ?? repository.provider.tts_model,
    },
  };
  await assertSchema(repositoryRoot, "episode.schema.json", config);
  await writeYaml(path.join(staging, "episode.yaml"), config);
  const blocks = sourceText.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((text) => text.trim()).filter(Boolean).map((text, index) => ({ id: `source-${String(index + 1).padStart(4, "0")}`, sha256: sha256(text), text }));
  const sourceMap = { schema_version: 1, source_sha256: config.source_sha256, blocks };
  await assertSchema(repositoryRoot, "source-map.schema.json", sourceMap);
  await atomicWrite(path.join(staging, ".work", "source-map.json"), `${JSON.stringify(sourceMap, null, 2)}\n`);
  await atomicWrite(path.join(staging, ".work", "answers.yaml"), "schema_version: 1\nplaceholders: {}\nproposals: {}\nclaims: {}\n");
  const context: EpisodeContext = { repositoryRoot, repository, root: staging, work: path.join(staging, ".work"), config };
  await appendEvent(context, { action: "episode_created", input_sha256: config.source_sha256, details: { source: path.relative(repositoryRoot, source), template, locale } });
  await rename(staging, root);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  return result;
}

export async function latestAttempt(context: EpisodeContext, pass: PassId): Promise<number> {
  const directory = path.join(context.work, "passes", pass);
  if (!await exists(directory)) return 0;
  const entries = await readdir(directory, { withFileTypes: true });
  return Math.max(0, ...entries.filter((entry) => entry.isDirectory() && /^attempt-\d+$/.test(entry.name)).map((entry) => Number(entry.name.slice(8))));
}

export async function latestCandidate(context: EpisodeContext): Promise<{ pass: PassId; attempt: number; path: string; markdown: string } | undefined> {
  for (const pass of [...PASS_ORDER].reverse()) {
    const attempt = await latestAttempt(context, pass);
    if (!attempt) continue;
    const filename = path.join(context.work, "passes", pass, `attempt-${String(attempt).padStart(3, "0")}`, "candidate.md");
    if (await exists(filename)) return { pass, attempt, path: filename, markdown: await readFile(filename, "utf8") };
  }
  return undefined;
}

export async function approvedInputFor(context: EpisodeContext, pass: PassId): Promise<{ markdown: string; source: string }> {
  const index = PASS_ORDER.indexOf(pass);
  if (index === 0) return { markdown: await readFile(path.join(context.root, "source.md"), "utf8"), source: "source.md" };
  const previous = PASS_ORDER[index - 1]!;
  const attempt = await latestAttempt(context, previous);
  if (!attempt) throw new PodcastError(`${previous} pass has not produced a candidate.`, "BLOCKED");
  const approvedDirectory = path.join(context.work, "passes", previous, `attempt-${String(attempt).padStart(3, "0")}`, "approved");
  if (!await exists(approvedDirectory)) throw new PodcastError(`${previous} candidate must be approved before ${pass}.`, "BLOCKED", `pnpm podcast pass ${context.config.slug} ${pass}`);
  const files = (await readdir(approvedDirectory)).filter((name) => name.endsWith(".md"));
  if (files.length !== 1) throw new PodcastError(`Approved ${previous} snapshot is missing or ambiguous.`, "INTEGRITY");
  const filename = path.join(approvedDirectory, files[0]!);
  return { markdown: await readFile(filename, "utf8"), source: filename };
}

export async function approvePriorPass(context: EpisodeContext, target: PassId): Promise<void> {
  const index = PASS_ORDER.indexOf(target);
  if (index <= 0) return;
  const previous = PASS_ORDER[index - 1]!;
  const attempt = await latestAttempt(context, previous);
  if (!attempt) return;
  const base = path.join(context.work, "passes", previous, `attempt-${String(attempt).padStart(3, "0")}`);
  const candidate = await readFile(path.join(base, "candidate.md"), "utf8");
  const digest = sha256(candidate);
  const approved = path.join(base, "approved", `${digest}.md`);
  if (!await exists(approved)) {
    await atomicWrite(approved, candidate);
    await appendEvent(context, { action: "pass_approved", pass: previous, attempt, output_sha256: digest });
  }
}

export async function writeEpisodeConfig(context: EpisodeContext): Promise<void> {
  await writeYaml(path.join(context.root, "episode.yaml"), context.config);
}
