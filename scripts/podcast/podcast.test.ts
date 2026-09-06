import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createAudioPlan } from "./audio.ts";
import { PodcastError } from "./domain.ts";
import { canonicalJson, sha256 } from "./io.ts";
import { atomicWrite, writeYaml } from "./io.ts";
import { estimateDuration, parseScript, placeholders, validateFinalScript } from "./script.ts";
import { replay, type EpisodeContext } from "./workspace.ts";
import { approveScript, runPass } from "./workflow.ts";
import { assertSchema } from "./validation.ts";

const SCRIPT = `---
schema_version: 1
episode: example
template: interview@0.1.0
locale: en-US
---
## welcome

### turn-001 | host | introduction
<!-- delivery: pace=conversational; pause_after=short -->
Welcome. Why does this story matter now?

### turn-002 | guest | answer
It matters because the way we talk to computers is changing.

## deep_dive:history

### turn-003 | host | question
What do you remember about the early internet?

### turn-004 | guest | reflection
I remember going to a university computer with my father just to get online.
`;

test("parses constrained dialogue and delivery metadata", () => {
  const parsed = parseScript(SCRIPT);
  assert.equal(parsed.turns.length, 4);
  assert.deepEqual(parsed.sections, ["welcome", "deep_dive:history"]);
  assert.equal(parsed.turns[0]?.delivery.pause_after, "short");
  assert.equal(parsed.turns[3]?.role, "guest");
});

test("detects placeholders and blocks them at final approval", () => {
  const candidate = `${SCRIPT}\n{{AUTHOR:memory-001 | Which year?}}\n`;
  assert.deepEqual(placeholders(candidate), [{ type: "AUTHOR", id: "memory-001" }]);
  assert.throws(() => validateFinalScript(candidate), (error: unknown) => error instanceof PodcastError && error.symbol === "BLOCKED");
});

test("duration estimate is deterministic and excludes metadata", () => {
  const first = estimateDuration(SCRIPT), second = estimateDuration(SCRIPT);
  assert.deepEqual(first, second);
  assert.ok(first.words > 20);
  assert.equal(first.input_sha256, sha256(SCRIPT));
});

test("canonical JSON sorts keys recursively", () => {
  assert.equal(canonicalJson({ z: 1, a: { d: 4, b: 2 } }), '{"a":{"b":2,"d":4},"z":1}');
});

test("plans deterministic native two-speaker scenes under configured limits", () => {
  const context = {
    repositoryRoot: process.cwd(), root: path.join(process.cwd(), "podcasts/example"), work: path.join(process.cwd(), "podcasts/example/.work"),
    config: { schema_version: 1, slug: "example", created_at: "2026-01-01T00:00:00Z", template: "interview@0.1.0", locale: "en-US", source_sha256: "source", roles: { host: { display_name: "Host", voice: "Kore" }, guest: { display_name: "Guest", voice: "Orus" } }, provider: { project: "project", location: "global", editing_model: "model", tts_model: "gemini-2.5-pro-tts" } },
    repository: { schema_version: 1, podcasts_root: "podcasts", templates_root: "podcast-templates", provider: { project: "project", location: "global", editing_model: "model", tts_model: "gemini-2.5-pro-tts" }, research: { command: "agy", maximum_retries: 2 }, audio: { maximum_rendered_request_utf8_bytes: 7500, maximum_estimated_scene_seconds: 300, host_voice: "Kore", guest_voice: "Orus", sample_rate_hz: 24000, bitrate: "64k", pauses_ms: { none: 0, short: 250, medium: 500, long: 900 } } },
  } satisfies EpisodeContext;
  const first = createAudioPlan(context, SCRIPT), second = createAudioPlan(context, SCRIPT);
  assert.deepEqual(first, second);
  assert.ok(first.scenes.every((scene) => scene.utf8_bytes <= 7500));
  assert.match(first.scenes[0]!.request, /Host:/);
  assert.match(first.scenes[0]!.request, /Guest:/);
});

test("replays event history into derived state", () => {
  const state = replay("example", [
    { schema_version: 1, sequence: 1, at: "x", action: "episode_created", episode: "example" },
    { schema_version: 1, sequence: 2, at: "x", action: "pass_generated", episode: "example", pass: "structure", output_sha256: "candidate", details: { candidate_path: ".work/candidate.md" } },
    { schema_version: 1, sequence: 3, at: "x", action: "script_approved", episode: "example", output_sha256: "script" },
  ]);
  assert.equal(state.phase, "script_approved");
  assert.equal(state.approved_script_sha256, "script");
  assert.equal(state.events, 3);
});

test("all checked-in JSON schemas parse and repository configuration validates", async () => {
  const directory = path.join(process.cwd(), "schemas", "podcast", "v1");
  for (const filename of await readdir(directory)) {
    if (filename.endsWith(".json")) JSON.parse(await readFile(path.join(directory, filename), "utf8"));
  }
  const YAML = (await import("yaml")).default;
  const repository = YAML.parse(await readFile(path.join(process.cwd(), "podcast.config.yaml"), "utf8"));
  await assertSchema(process.cwd(), "repository-config.schema.json", repository);
});

test("runs all text passes with injected providers and stops at each approval gate", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "podcast-test-"));
  try {
    const root = path.join(temporary, "episode"), work = path.join(root, ".work");
    await mkdir(work, { recursive: true });
    await atomicWrite(path.join(root, "source.md"), "A source paragraph.");
    await atomicWrite(path.join(work, "source-map.json"), `${JSON.stringify({ schema_version: 1, source_sha256: sha256("A source paragraph."), blocks: [{ id: "source-0001", sha256: sha256("A source paragraph."), text: "A source paragraph." }] })}\n`);
    await atomicWrite(path.join(work, "answers.yaml"), "schema_version: 1\nplaceholders: {}\nproposals: {}\nclaims: {}\n");
    const context = {
      repositoryRoot: process.cwd(), root, work,
      config: { schema_version: 1, slug: "integration", created_at: "2026-01-01T00:00:00Z", template: "interview@0.1.0", locale: "en-US", source_sha256: sha256("A source paragraph."), roles: { host: { display_name: "Host", voice: "Kore" }, guest: { display_name: "Guest", voice: "Orus" } }, provider: { project: "project", location: "global", editing_model: "agy-default", tts_model: "fake-tts" } },
      repository: { schema_version: 1, podcasts_root: "podcasts", templates_root: "podcast-templates", provider: { project: "project", location: "global", editing_model: "agy-default", tts_model: "fake-tts" }, research: { command: "agy", maximum_retries: 2 }, audio: { maximum_rendered_request_utf8_bytes: 7500, maximum_estimated_scene_seconds: 300, host_voice: "Kore", guest_voice: "Orus", sample_rate_hz: 24000, bitrate: "64k", pauses_ms: { none: 0, short: 250, medium: 500, long: 900 } } },
    } satisfies EpisodeContext;
    await writeYaml(path.join(root, "episode.yaml"), context.config);
    const editingRunner = async (_context: EpisodeContext, pass: "structure" | "content" | "performance") => ({
      response: { candidate_markdown: SCRIPT, review: { summary: `${pass} complete`, source_coverage: [{ source_id: "source-0001", outcome: "mapped" as const, turn_ids: ["turn-002"] }], changes: [], placeholders: [], claims: [], proposals: [], validations: [], security_findings: [] } },
      metadata: { provider: "fake" }, prompt: `fake ${pass}`,
    });
    const options = { dryRun: false, yes: true, rerun: false, research: false, maxEditingInvocations: 3, maxResearchInvocations: 0, confirm: async () => true, editingRunner };
    await runPass(context, "structure", options);
    assert.equal(replay("integration", await (await import("./workspace.ts")).events(context)).phase, "pass_review");
    await runPass(context, "content", options);
    await runPass(context, "performance", options);
    await approveScript(context, false);
    assert.equal(await readFile(path.join(root, "final", "script.md"), "utf8"), SCRIPT);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
