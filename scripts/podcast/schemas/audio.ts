import { Static, Type } from "@sinclair/typebox";
import { Sha256Schema, StringArraySchema } from "./shared.ts";

export const SceneSchema = Type.Object({
  id: Type.String(),
  turn_ids: StringArraySchema,
  request: Type.String(),
  request_sha256: Sha256Schema,
  utf8_bytes: Type.Integer({ minimum: 1 }),
  estimated_seconds: Type.Number({ minimum: 0 }),
  pause_after_ms: Type.Integer({ minimum: 0 }),
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("generated"),
    Type.Literal("approved"),
  ]),
  active_candidate: Type.Optional(Type.String()),
}, { additionalProperties: false });
export type AudioScene = Static<typeof SceneSchema>;

export const AudioPlanSchema = Type.Object({
  schema_version: Type.Literal(1),
  planner_version: Type.Literal(1),
  episode: Type.String(),
  script_sha256: Sha256Schema,
  model: Type.String(),
  project: Type.Union([Type.String(), Type.Null()]),
  location: Type.String(),
  locale: Type.String(),
  voices: Type.Object({ host: Type.String(), guest: Type.String() }, {
    additionalProperties: false,
  }),
  scenes: Type.Array(SceneSchema),
  estimated_base_usd: Type.Number({ minimum: 0 }),
  retry_reserved_usd: Type.Number({ minimum: 0 }),
  plan_sha256: Sha256Schema,
}, { $id: "audio-plan.schema.json", additionalProperties: false });
export type AudioPlanDocument = Static<typeof AudioPlanSchema>;

export const SceneCandidateSchema = Type.Object({
  schema_version: Type.Literal(1),
  id: Type.String(),
  scene_id: Type.String(),
  request_sha256: Sha256Schema,
  audio_sha256: Sha256Schema,
  duration_seconds: Type.Number({ exclusiveMinimum: 0 }),
  generated_at: Type.String(),
  response_id: Type.Optional(Type.String()),
  model_version: Type.Optional(Type.String()),
  mime_type: Type.Optional(Type.String()),
  usage: Type.Optional(Type.Unknown()),
  approved: Type.Boolean(),
  approved_at: Type.Optional(Type.String()),
}, { $id: "scene-candidate.schema.json", additionalProperties: false });
export type SceneCandidate = Static<typeof SceneCandidateSchema>;

const SelectedSceneSchema = Type.Object({
  scene_id: Type.String(),
  turn_ids: StringArraySchema,
  candidate_id: Type.String(),
  audio_sha256: Sha256Schema,
  start_seconds: Type.Number({ minimum: 0 }),
  end_seconds: Type.Number({ minimum: 0 }),
}, { additionalProperties: false });

export const AssemblySchema = Type.Object({
  schema_version: Type.Literal(1),
  plan_sha256: Sha256Schema,
  selected: Type.Array(SelectedSceneSchema),
  loudnorm: Type.Record(Type.String(), Type.Unknown()),
  master_sha256: Sha256Schema,
  mp3_sha256: Sha256Schema,
  assembled_at: Type.String(),
  approved: Type.Boolean(),
  approved_at: Type.Optional(Type.String()),
}, { $id: "assembly.schema.json", additionalProperties: false });
export type Assembly = Static<typeof AssemblySchema>;

export const FinalScriptManifestSchema = Type.Object({
  schema_version: Type.Literal(1),
  episode: Type.String(),
  script_sha256: Sha256Schema,
  source_sha256: Sha256Schema,
  template: Type.String(),
  locale: Type.String(),
  approved_at: Type.String(),
  pass_attempt: Type.Integer({ minimum: 1 }),
  review_sha256: Sha256Schema,
}, { $id: "final-script-manifest.schema.json", additionalProperties: false });
export type FinalScriptManifest = Static<typeof FinalScriptManifestSchema>;

export const FinalAudioManifestSchema = Type.Composite([AssemblySchema], {
  $id: "final-audio-manifest.schema.json",
  additionalProperties: false,
});
export type FinalAudioManifest = Static<typeof FinalAudioManifestSchema>;

export const CliResultSchema = Type.Object({
  schema_version: Type.Literal(1),
  ok: Type.Boolean(),
  data: Type.Optional(Type.Unknown()),
  error: Type.Optional(Type.Object({
    symbol: Type.String(),
    message: Type.String(),
    recovery: Type.Union([Type.String(), Type.Null()]),
  }, { additionalProperties: false })),
}, { $id: "cli-result.schema.json", additionalProperties: false });
export type CliResult = Static<typeof CliResultSchema>;
