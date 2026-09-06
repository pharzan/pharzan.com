import { GoogleGenAI } from "@google/genai";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PodcastError } from "./domain.ts";
import { atomicWrite, canonicalJson, exists, sha256 } from "./io.ts";
import { estimateDuration, parseScript, spokenText, Turn, validateFinalScript } from "./script.ts";
import type { AudioPlanDocument, AudioScene } from "./schemas/index.ts";
import { appendEvent, EpisodeContext } from "./workspace.ts";

const SAMPLE_RATE = 24_000;

export type Scene = AudioScene;
export type AudioPlan = AudioPlanDocument;

function renderScene(turns: Turn[]): string {
  const transcript = turns.map((turn) => `${turn.role === "host" ? "Host" : "Guest"}: ${spokenText(turn)}`).join("\n\n");
  return `Create a natural two-person podcast conversation in ${turns.length ? "the episode locale" : "English"}. The host is warm and curious; the guest is reflective, conversational, and tells the story directly to the host. Keep short turns responsive and never sound like a lecture or audiobook. Do not speak labels or directions.\n\nTranscript:\n${transcript}`;
}

function estimateTurns(turns: Turn[]): number {
  const markdown = `## scene\n\n${turns.map((turn) => `### ${turn.id} | ${turn.role} | ${turn.intent}\n${turn.spoken}`).join("\n\n")}`;
  return estimateDuration(markdown).seconds;
}

export function createAudioPlan(context: EpisodeContext, markdown: string): AudioPlan {
  if (context.config.provider.tts_model !== "gemini-2.5-pro-tts") throw new PodcastError("V1 cost policy supports TTS model gemini-2.5-pro-tts only.", "BLOCKED");
  const parsed = validateFinalScript(markdown);
  const maxBytes = context.repository.audio.maximum_rendered_request_utf8_bytes;
  const maxSeconds = context.repository.audio.maximum_estimated_scene_seconds;
  const groups: Turn[][] = [];
  for (const section of parsed.sections) {
    let current: Turn[] = [];
    for (const turn of parsed.turns.filter((item) => item.section === section)) {
      const candidate = [...current, turn];
      const request = renderScene(candidate);
      if (current.length && (Buffer.byteLength(request, "utf8") > maxBytes || estimateTurns(candidate) > maxSeconds)) {
        const last = current.at(-1);
        if (last?.role === "host" && turn.role === "guest" && current.length > 1) {
          groups.push(current.slice(0, -1)); current = [last, turn];
        } else {
          groups.push(current); current = [turn];
        }
      } else current = candidate;
    }
    if (current.length) groups.push(current);
  }
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]!;
    if (new Set(group.map((turn) => turn.role)).size > 1) continue;
    const neighborIndex = index < groups.length - 1 ? index + 1 : index - 1;
    if (neighborIndex < 0) continue;
    const combined = neighborIndex > index ? [...group, ...groups[neighborIndex]!] : [...groups[neighborIndex]!, ...group];
    if (Buffer.byteLength(renderScene(combined), "utf8") <= maxBytes && estimateTurns(combined) <= maxSeconds) {
      groups[Math.min(index, neighborIndex)] = combined; groups.splice(Math.max(index, neighborIndex), 1); index = Math.max(-1, index - 2);
    }
  }
  const scenes: Scene[] = groups.map((turns, index) => {
    const request = renderScene(turns);
    if (Buffer.byteLength(request, "utf8") > maxBytes || estimateTurns(turns) > maxSeconds) throw new PodcastError(`Turn ${turns[0]!.id} cannot fit a valid native scene.`, "BLOCKED");
    const pause = turns.at(-1)?.delivery.pause_after ?? "medium";
    return { id: `scene-${String(index + 1).padStart(3, "0")}`, turn_ids: turns.map((turn) => turn.id), request, request_sha256: sha256(request), utf8_bytes: Buffer.byteLength(request, "utf8"), estimated_seconds: estimateTurns(turns), pause_after_ms: (context.repository.audio.pauses_ms as Record<string, number>)[pause] ?? 500, status: "pending" };
  });
  const inputTokens = scenes.reduce((sum, scene) => sum + Math.ceil(scene.request.length / 4), 0);
  const outputTokens = scenes.reduce((sum, scene) => sum + scene.estimated_seconds * 25, 0);
  const base = inputTokens / 1_000_000 + outputTokens * 20 / 1_000_000;
  const body = { schema_version: 1 as const, planner_version: 1 as const, episode: context.config.slug, script_sha256: sha256(markdown), model: context.config.provider.tts_model, project: context.config.provider.project ?? process.env.GOOGLE_CLOUD_PROJECT ?? null, location: context.config.provider.location, locale: context.config.locale, voices: { host: context.config.roles.host.voice, guest: context.config.roles.guest.voice }, scenes, estimated_base_usd: Number(base.toFixed(6)), retry_reserved_usd: Number((base * 3).toFixed(6)) };
  return { ...body, plan_sha256: sha256(canonicalJson(body)) };
}

function projectFor(context: EpisodeContext): string {
  const value = context.config.provider.project ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (!value) throw new PodcastError("No Google Cloud project configured.", "BLOCKED");
  return value;
}

function wavBuffer(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8); header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function retryable(error: unknown): boolean {
  const object = error as { status?: number; code?: number };
  return [429, 500, 502, 503, 504].includes(object?.status ?? object?.code ?? 0);
}

export async function generateAudio(context: EpisodeContext, plan: AudioPlan, maxCostUsd: number, regenerateSceneId?: string): Promise<void> {
  const target = regenerateSceneId ? plan.scenes.find((scene) => scene.id === regenerateSceneId) : undefined;
  if (regenerateSceneId && !target) throw new PodcastError(`Unknown scene: ${regenerateSceneId}`);
  const reserved = target
    ? Number(((Math.ceil(target.request.length / 4) / 1_000_000 + target.estimated_seconds * 25 * 20 / 1_000_000) * 3).toFixed(6))
    : plan.retry_reserved_usd;
  if (maxCostUsd < reserved) throw new PodcastError(`Authorized cost $${maxCostUsd} is below retry-reserved estimate $${reserved}.`, "BLOCKED");
  const ai = new GoogleGenAI({ vertexai: true, project: projectFor(context), location: context.config.provider.location });
  for (const scene of plan.scenes) {
    if (regenerateSceneId && scene.id !== regenerateSceneId) continue;
    const sceneRoot = path.join(context.work, "audio", "scenes", scene.id);
    const existing = await activeCandidate(sceneRoot, scene.request_sha256);
    if (existing && !regenerateSceneId) { scene.status = existing.approved ? "approved" : "generated"; scene.active_candidate = existing.id; continue; }
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await ai.models.generateContent({ model: plan.model, contents: scene.request, config: { responseModalities: ["AUDIO"], speechConfig: { languageCode: plan.locale, multiSpeakerVoiceConfig: { speakerVoiceConfigs: [
          { speaker: "Host", voiceConfig: { prebuiltVoiceConfig: { voiceName: plan.voices.host } } },
          { speaker: "Guest", voiceConfig: { prebuiltVoiceConfig: { voiceName: plan.voices.guest } } },
        ] } } } });
        const part = response.candidates?.[0]?.content?.parts?.find((item) => item.inlineData?.data);
        const encoded = part?.inlineData?.data;
        if (!encoded) throw new PodcastError(`Vertex returned no audio for ${scene.id}.`, "EXTERNAL");
        const pcm = Buffer.from(encoded, "base64");
        if (!pcm.length || pcm.length % 2) throw new PodcastError(`Vertex returned invalid PCM for ${scene.id}.`, "EXTERNAL");
        const id = `candidate-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const root = path.join(sceneRoot, "candidates", id);
        const wav = wavBuffer(pcm);
        await atomicWrite(path.join(root, "audio.wav"), wav);
        await atomicWrite(path.join(root, "manifest.json"), `${JSON.stringify({ schema_version: 1, id, scene_id: scene.id, request_sha256: scene.request_sha256, audio_sha256: sha256(wav), duration_seconds: pcm.length / (SAMPLE_RATE * 2), generated_at: new Date().toISOString(), response_id: response.responseId, model_version: response.modelVersion, mime_type: part?.inlineData?.mimeType, usage: response.usageMetadata, approved: false }, null, 2)}\n`);
        await atomicWrite(path.join(sceneRoot, "request.txt"), scene.request);
        scene.status = "generated"; scene.active_candidate = id; lastError = undefined; break;
      } catch (error) {
        lastError = error;
        if (attempt >= 3 || !retryable(error)) break;
      }
    }
    if (lastError) {
      await atomicWrite(path.join(sceneRoot, "error.json"), `${JSON.stringify({ at: new Date().toISOString(), error: (lastError as Error).message }, null, 2)}\n`);
      await atomicWrite(path.join(context.work, "audio", "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
      throw new PodcastError(`Audio generation stopped at ${scene.id}: ${(lastError as Error).message}`, "INCOMPLETE", `pnpm podcast resume ${context.config.slug}`);
    }
  }
  await atomicWrite(path.join(context.work, "audio", "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  await appendEvent(context, { action: regenerateSceneId ? "audio_scene_regenerated" : "audio_generated", input_sha256: plan.plan_sha256, details: regenerateSceneId ? { scene_id: regenerateSceneId } : undefined });
}

async function activeCandidate(sceneRoot: string, requestSha256?: string): Promise<{ id: string; approved: boolean; manifest: Record<string, unknown>; wav: string } | undefined> {
  const root = path.join(sceneRoot, "candidates");
  if (!await exists(root)) return undefined;
  const entries = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => b.name.localeCompare(a.name));
  for (const entry of entries) {
    const manifest = JSON.parse(await readFile(path.join(root, entry.name, "manifest.json"), "utf8")) as Record<string, unknown>;
    if (requestSha256 && manifest.request_sha256 !== requestSha256) continue;
    return { id: entry.name, approved: manifest.approved === true, manifest, wav: path.join(root, entry.name, "audio.wav") };
  }
  return undefined;
}

export async function approveScene(context: EpisodeContext, sceneId: string): Promise<void> {
  const plan = await readPlan(context);
  const scene = plan.scenes.find((item) => item.id === sceneId);
  if (!scene) throw new PodcastError(`Unknown scene: ${sceneId}`);
  const candidate = await activeCandidate(path.join(context.work, "audio", "scenes", scene.id), scene.request_sha256);
  if (!candidate) throw new PodcastError(`${sceneId} has no generated candidate.`, "BLOCKED");
  candidate.manifest.approved = true; candidate.manifest.approved_at = new Date().toISOString();
  await atomicWrite(path.join(context.work, "audio", "scenes", scene.id, "candidates", candidate.id, "manifest.json"), `${JSON.stringify(candidate.manifest, null, 2)}\n`);
  scene.status = "approved"; scene.active_candidate = candidate.id;
  await atomicWrite(path.join(context.work, "audio", "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  await appendEvent(context, { action: "audio_scene_approved", details: { scene_id: scene.id, candidate_id: candidate.id } });
}

export async function readPlan(context: EpisodeContext): Promise<AudioPlan> {
  const filename = path.join(context.work, "audio", "plan.json");
  if (!await exists(filename)) throw new PodcastError("Audio has not been planned.", "BLOCKED");
  return JSON.parse(await readFile(filename, "utf8")) as AudioPlan;
}

function run(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] }); let stdout = "", stderr = "";
    child.stdout.on("data", (data: Buffer) => stdout += data); child.stderr.on("data", (data: Buffer) => stderr += data);
    child.on("error", reject); child.on("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} failed (${code}): ${stderr.slice(-2000)}`)));
  });
}

function concatEscape(filename: string): string { return filename.replaceAll("'", "'\\''"); }

export async function assembleAudio(context: EpisodeContext): Promise<{ mp3: string; manifest: string }> {
  const plan = await readPlan(context);
  const work = path.join(context.work, "audio", "assemblies", `assembly-${Date.now()}`); await mkdir(work, { recursive: true });
  const sequence: string[] = []; const selected: Array<Record<string, unknown>> = []; let timelineSeconds = 0;
  for (const [index, scene] of plan.scenes.entries()) {
    const candidate = await activeCandidate(path.join(context.work, "audio", "scenes", scene.id), scene.request_sha256);
    if (!candidate?.approved) throw new PodcastError(`${scene.id} must be listened to and approved before assembly.`, "BLOCKED");
    const duration = Number(candidate.manifest.duration_seconds);
    if (!Number.isFinite(duration) || duration <= 0) throw new PodcastError(`${scene.id} has invalid duration metadata.`, "INTEGRITY");
    sequence.push(candidate.wav); selected.push({ scene_id: scene.id, turn_ids: scene.turn_ids, candidate_id: candidate.id, audio_sha256: candidate.manifest.audio_sha256, start_seconds: Number(timelineSeconds.toFixed(3)), end_seconds: Number((timelineSeconds + duration).toFixed(3)) });
    timelineSeconds += duration;
    if (index < plan.scenes.length - 1 && scene.pause_after_ms > 0) {
      const silence = path.join(work, `silence-${scene.pause_after_ms}.wav`);
      if (!await exists(silence)) await atomicWrite(silence, wavBuffer(Buffer.alloc(Math.round(SAMPLE_RATE * scene.pause_after_ms / 1000) * 2)));
      sequence.push(silence);
      timelineSeconds += scene.pause_after_ms / 1000;
    }
  }
  const concat = path.join(work, "concat.txt");
  await atomicWrite(concat, `${sequence.map((file) => `file '${concatEscape(path.resolve(file))}'`).join("\n")}\n`);
  const raw = path.join(work, "raw.wav"), master = path.join(work, "master.wav"), mp3 = path.join(work, "candidate.mp3");
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", concat, "-ac", "1", "-ar", String(SAMPLE_RATE), raw]);
  const analysis = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", raw, "-af", "loudnorm=I=-19:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"]);
  const match = analysis.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  if (!match) throw new PodcastError("ffmpeg loudness analysis did not return measurements.", "EXTERNAL");
  const measured = JSON.parse(match[0]) as Record<string, string>;
  const filter = `loudnorm=I=-19:TP=-1.5:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=summary`;
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-af", filter, "-ac", "1", "-ar", String(SAMPLE_RATE), master]);
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", master, "-ac", "1", "-ar", String(SAMPLE_RATE), "-codec:a", "libmp3lame", "-b:a", context.repository.audio.bitrate, mp3]);
  const mp3Bytes = await readFile(mp3); const masterBytes = await readFile(master);
  const manifestPath = path.join(work, "manifest.json");
  await atomicWrite(manifestPath, `${JSON.stringify({ schema_version: 1, plan_sha256: plan.plan_sha256, selected, loudnorm: { target_i: -19, target_tp: -1.5, measured }, master_sha256: sha256(masterBytes), mp3_sha256: sha256(mp3Bytes), assembled_at: new Date().toISOString(), approved: false }, null, 2)}\n`);
  await appendEvent(context, { action: "audio_assembled", input_sha256: plan.plan_sha256, output_sha256: sha256(mp3Bytes), details: { mp3: path.relative(context.root, mp3), manifest: path.relative(context.root, manifestPath) } });
  return { mp3, manifest: manifestPath };
}
