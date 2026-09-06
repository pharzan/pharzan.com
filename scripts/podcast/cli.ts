import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { approveScene, assembleAudio, createAudioPlan, generateAudio, readPlan } from "./audio.ts";
import { EXIT, PASS_ORDER, PassId, PodcastError } from "./domain.ts";
import { atomicWrite, exists, sha256, withEpisodeLock } from "./io.ts";
import { estimateDuration } from "./script.ts";
import { assertSchema } from "./validation.ts";
import { approveScript, runPass } from "./workflow.ts";
import { appendEvent, createEpisode, episodeContext, events, latestCandidate, replay } from "./workspace.ts";

type Flags = ReturnType<typeof flags>["values"];

function flags(args: string[]) {
  return parseArgs({ args, allowPositionals: true, strict: true, options: {
    source: { type: "string" }, template: { type: "string", default: "interview@0.1.0" }, locale: { type: "string", default: "en-US" },
    "dry-run": { type: "boolean", default: false }, json: { type: "boolean", default: false }, yes: { type: "boolean", short: "y", default: false },
    research: { type: "boolean", default: false }, "max-research-invocations": { type: "string", default: "0" }, "max-editing-invocations": { type: "string", default: "0" }, "max-cost-usd": { type: "string" },
    project: { type: "string" }, location: { type: "string" }, "editing-model": { type: "string" }, "tts-model": { type: "string" }, "host-voice": { type: "string" }, "guest-voice": { type: "string" },
    rerun: { type: "boolean", default: false }, network: { type: "boolean", default: false }, "recover-lock": { type: "boolean", default: false },
  } });
}

async function confirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const terminal = createInterface({ input: process.stdin, output: process.stderr });
  try { return /^y(?:es)?$/i.test((await terminal.question(`${message} [y/N] `)).trim()); } finally { terminal.close(); }
}

function output(value: unknown, json: boolean): void {
  if (json) console.log(JSON.stringify(value, null, 2));
  else if (typeof value === "string") console.log(value);
  else console.log(JSON.stringify(value, null, 2));
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new PodcastError(`Missing ${label}.`); return value;
}

async function doctor(slug?: string): Promise<Record<string, unknown>> {
  const checks: Record<string, unknown> = { node: process.version, node_ok: Number(process.versions.node.split(".")[0]) >= 20, agy: false, ffmpeg: false, episode: null };
  const probe = async (command: string, arg: string) => await new Promise<boolean>((resolve) => { import("node:child_process").then(({ spawn }) => { const child = spawn(command, [arg], { stdio: "ignore" }); child.on("error", () => resolve(false)); child.on("close", (code) => resolve(code === 0)); }); });
  checks.agy = await probe("agy", "--version"); checks.ffmpeg = await probe("ffmpeg", "-version");
  if (slug) {
    const context = await episodeContext(slug); checks.episode = replay(slug, await events(context));
    const lock = path.join(context.work, "lock"); checks.locked = await exists(lock);
    if (checks.locked) checks.lock_owner = JSON.parse(await readFile(lock, "utf8"));
    checks.project = context.config.provider.project ?? process.env.GOOGLE_CLOUD_PROJECT ?? null;
    checks.location = context.config.provider.location;
  }
  return checks;
}

async function recoverLock(context: Awaited<ReturnType<typeof episodeContext>>, yes: boolean): Promise<boolean> {
  const filename = path.join(context.work, "lock");
  if (!await exists(filename)) return false;
  let lock: { pid?: number; host?: string; command?: string };
  try { lock = JSON.parse(await readFile(filename, "utf8")) as typeof lock; }
  catch { throw new PodcastError("Lock metadata is corrupt; inspect it manually before removal.", "INTEGRITY"); }
  const localHost = process.env.HOSTNAME ?? "unknown";
  if (lock.host !== localHost || !Number.isInteger(lock.pid)) throw new PodcastError("Cannot prove the lock belongs to a stale local process.", "BLOCKED");
  try { process.kill(lock.pid!, 0); throw new PodcastError(`Lock owner PID ${lock.pid} is still running (${lock.command ?? "unknown command"}).`, "BLOCKED"); }
  catch (error) { if (error instanceof PodcastError) throw error; if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
  const accepted = yes || await confirm(`Remove verified stale lock for PID ${lock.pid}?`);
  if (!accepted) throw new PodcastError("Stale lock recovery was not approved.", "BLOCKED");
  await unlink(filename);
  await withEpisodeLock(context.root, "recover lock", () => appendEvent(context, { action: "stale_lock_recovered", details: { stale_pid: lock.pid, stale_command: lock.command } }));
  return true;
}

async function assertCurrentAudioPlan(context: Awaited<ReturnType<typeof episodeContext>>, plan: Awaited<ReturnType<typeof readPlan>>): Promise<void> {
  const scriptPath = path.join(context.root, "final", "script.md");
  if (!await exists(scriptPath) || sha256(await readFile(scriptPath)) !== plan.script_sha256 || context.config.approved_script_sha256 !== plan.script_sha256) {
    throw new PodcastError("Audio plan is stale because the approved script changed; run audio plan again.", "BLOCKED");
  }
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const parsed = flags(argv); const [command, ...positionals] = parsed.positionals; const values = parsed.values; const json = values.json;
  if (!command) throw new PodcastError("Usage: pnpm podcast <create|status|history|doctor|estimate|pass|approve-script|audio|resume> ...");
  if (command === "create") {
    const slug = required(positionals[0], "episode slug"); const source = required(values.source, "--source");
    output(await createEpisode(slug, source, values.template, values.locale, values["dry-run"], {
      project: values.project,
      location: values.location,
      editing_model: values["editing-model"],
      tts_model: values["tts-model"],
      host_voice: values["host-voice"],
      guest_voice: values["guest-voice"],
    }), json); return;
  }
  if (command === "doctor") { output(await doctor(positionals[0]), json); return; }
  const slug = command === "audio" ? required(positionals[1], "episode slug") : required(positionals[0], "episode slug");
  const context = await episodeContext(slug);
  if (command === "status") { output(replay(slug, await events(context)), json); return; }
  if (command === "history") { output(await events(context), json); return; }
  if (command === "estimate") {
    const candidate = await latestCandidate(context); const final = path.join(context.root, "final", "script.md");
    const markdown = await exists(final) ? await readFile(final, "utf8") : candidate?.markdown;
    if (!markdown) throw new PodcastError("No structured candidate is available.", "BLOCKED"); output(estimateDuration(markdown), json); return;
  }
  if (command === "pass") {
    const pass = required(positionals[1], "pass") as PassId; if (!PASS_ORDER.includes(pass)) throw new PodcastError(`Unknown pass: ${pass}`);
    output(await runPass(context, pass, { dryRun: values["dry-run"], yes: values.yes, rerun: values.rerun, research: values.research, maxEditingInvocations: Number(values["max-editing-invocations"]), maxResearchInvocations: Number(values["max-research-invocations"]), confirm, showPlan: (plan) => console.error(JSON.stringify(plan, null, 2)) }), json); return;
  }
  if (command === "approve-script") { output(await approveScript(context, values["dry-run"]), json); return; }
  if (command === "audio") {
    const subcommand = required(positionals[0], "audio subcommand");
    if (subcommand === "plan") {
      const scriptPath = path.join(context.root, "final", "script.md"); if (!await exists(scriptPath)) throw new PodcastError("Approve the final script before audio planning.", "BLOCKED");
      const plan = createAudioPlan(context, await readFile(scriptPath, "utf8"));
      await assertSchema(context.repositoryRoot, "audio-plan.schema.json", plan);
      if (!values["dry-run"]) await withEpisodeLock(context.root, "audio plan", async () => { await atomicWrite(path.join(context.work, "audio", "plan.json"), `${JSON.stringify(plan, null, 2)}\n`); await appendEvent(context, { action: "audio_planned", input_sha256: plan.script_sha256, output_sha256: plan.plan_sha256 }); });
      output({ ...plan, dry_run: values["dry-run"] }, json); return;
    }
    if (subcommand === "generate") {
      const plan = await readPlan(context); await assertCurrentAudioPlan(context, plan); if (values["dry-run"]) { output({ dry_run: true, plan }, json); return; }
      console.error(JSON.stringify({ plan_sha256: plan.plan_sha256, model: plan.model, project: plan.project, location: plan.location, voices: plan.voices, scenes: plan.scenes.map(({ id, turn_ids, utf8_bytes, estimated_seconds, status }) => ({ id, turn_ids, utf8_bytes, estimated_seconds, status })), estimated_base_usd: plan.estimated_base_usd, retry_reserved_usd: plan.retry_reserved_usd }, null, 2));
      const maximum = Number(values["max-cost-usd"]); if (!values.yes || !Number.isFinite(maximum)) throw new PodcastError("Audio generation requires --yes --max-cost-usd <amount>.", "BLOCKED");
      await withEpisodeLock(context.root, "audio generate", () => generateAudio(context, plan, maximum)); output({ generated: true, stopped_for_scene_approval: true }, json); return;
    }
    if (subcommand === "scene") {
      const sceneId = required(positionals[2], "scene ID"), action = required(positionals[3], "scene action");
      if (action === "approve") { if (values["dry-run"]) { output({ dry_run: true, scene: sceneId, action }, json); return; } await withEpisodeLock(context.root, `audio scene ${sceneId} approve`, () => approveScene(context, sceneId)); output({ scene: sceneId, approved: true }, json); return; }
      if (action === "regenerate") {
        if (values["dry-run"]) { output({ dry_run: true, scene: sceneId }, json); return; }
        const maximum = Number(values["max-cost-usd"]); if (!values.yes || !Number.isFinite(maximum)) throw new PodcastError("Scene regeneration requires --yes --max-cost-usd <amount>.", "BLOCKED");
        const plan = await readPlan(context); await assertCurrentAudioPlan(context, plan); await withEpisodeLock(context.root, `audio scene ${sceneId} regenerate`, () => generateAudio(context, plan, maximum, sceneId)); output({ scene: sceneId, regenerated: true, stopped_for_scene_approval: true }, json); return;
      }
      if (action === "replace-script") { await appendEvent(context, { action: "audio_replace_script_requested", details: { scene_id: sceneId } }); throw new PodcastError("Edit and rerun the performance pass; affected audio lineage is now invalid.", "BLOCKED"); }
      throw new PodcastError(`Unknown scene action: ${action}`);
    }
    if (subcommand === "assemble") { const plan = await readPlan(context); await assertCurrentAudioPlan(context, plan); if (values["dry-run"]) { output({ dry_run: true, plan }, json); return; } output(await withEpisodeLock(context.root, "audio assemble", () => assembleAudio(context)), json); return; }
    if (subcommand === "approve") {
      await assertCurrentAudioPlan(context, await readPlan(context));
      const history = await events(context); const assembled = [...history].reverse().find((event) => event.action === "audio_assembled");
      if (!assembled) throw new PodcastError("No assembled audio candidate exists.", "BLOCKED");
      const mp3 = path.join(context.root, String(assembled.details?.mp3)); const sourceManifest = path.join(context.root, String(assembled.details?.manifest));
      if (values["dry-run"]) { output({ dry_run: true, mp3, sourceManifest }, json); return; }
      const accepted = values.yes || await confirm("Confirm you listened to the complete assembled episode and approve it?"); if (!accepted) throw new PodcastError("Full audio approval was not confirmed.", "BLOCKED");
      await withEpisodeLock(context.root, "audio approve", async () => {
        const bytes = await readFile(mp3); const manifest = JSON.parse(await readFile(sourceManifest, "utf8")) as Record<string, unknown>; manifest.approved = true; manifest.approved_at = new Date().toISOString();
        await atomicWrite(path.join(context.root, "final", "episode.mp3"), bytes); await atomicWrite(path.join(context.root, "final", "audio-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
        context.config.approved_audio_sha256 = sha256(bytes); const { writeEpisodeConfig } = await import("./workspace.ts"); await writeEpisodeConfig(context); await appendEvent(context, { action: "audio_approved", input_sha256: String(manifest.mp3_sha256), output_sha256: sha256(bytes) });
      }); output({ approved: true, output: path.join(context.root, "final", "episode.mp3") }, json); return;
    }
    throw new PodcastError(`Unknown audio subcommand: ${subcommand}`);
  }
  if (command === "resume") {
    if (values["recover-lock"]) await recoverLock(context, values.yes);
    const state = replay(slug, await events(context));
    if (state.phase === "audio_planned" || state.phase === "audio_scene_review") throw new PodcastError(`Resume audio with: pnpm podcast audio generate ${slug} --yes --max-cost-usd <amount>`, "BLOCKED");
    output({ state, message: "No interrupted provider operation needs automatic recovery." }, json); return;
  }
  if (command === "migrate") { output({ schema_version: 1, migration_required: false, dry_run: values["dry-run"] }, json); return; }
  throw new PodcastError(`Unknown command: ${command}`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  try { await runCli(argv); }
  catch (error) {
    const podcast = error instanceof PodcastError ? error : new PodcastError((error as Error).message, "INTEGRITY");
    if (argv.includes("--json")) console.log(JSON.stringify({ schema_version: 1, ok: false, error: { symbol: podcast.symbol, message: podcast.message, recovery: podcast.recovery ?? null } }, null, 2));
    else { console.error(`${podcast.symbol}: ${podcast.message}`); if (podcast.recovery) console.error(`Recovery: ${podcast.recovery}`); }
    process.exitCode = EXIT[podcast.symbol];
  }
}
