import { Static, Type } from "@sinclair/typebox";
import {
  PassIdSchema,
  Sha256Schema,
  StringMapSchema,
} from "./shared.ts";

export const RepositoryConfigSchema = Type.Object({
  schema_version: Type.Literal(1),
  podcasts_root: Type.String(),
  templates_root: Type.String(),
  provider: Type.Object({
    project: Type.Union([Type.String(), Type.Null()]),
    location: Type.String(),
    editing_model: Type.String(),
    tts_model: Type.String(),
  }, { additionalProperties: false }),
  research: Type.Object({
    command: Type.String(),
    maximum_retries: Type.Integer({ minimum: 0, maximum: 2 }),
  }, { additionalProperties: false }),
  audio: Type.Object({
    maximum_rendered_request_utf8_bytes: Type.Integer({ minimum: 1 }),
    maximum_estimated_scene_seconds: Type.Integer({ minimum: 1 }),
    host_voice: Type.String(),
    guest_voice: Type.String(),
    sample_rate_hz: Type.Integer({ minimum: 1 }),
    bitrate: Type.String(),
    pauses_ms: Type.Object({
      none: Type.Integer({ minimum: 0 }),
      short: Type.Integer({ minimum: 0 }),
      medium: Type.Integer({ minimum: 0 }),
      long: Type.Integer({ minimum: 0 }),
    }, { additionalProperties: false }),
  }, { additionalProperties: false }),
}, { $id: "repository-config.schema.json", additionalProperties: false });
export type RepositoryConfig = Static<typeof RepositoryConfigSchema>;

const EpisodeRoleSchema = Type.Object({
  display_name: Type.String(),
  voice: Type.String(),
}, { additionalProperties: false });

export const EpisodeSchema = Type.Object({
  schema_version: Type.Literal(1),
  slug: Type.String({ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }),
  created_at: Type.String(),
  template: Type.Literal("interview@0.1.0"),
  locale: Type.String(),
  source_sha256: Sha256Schema,
  roles: Type.Object({ host: EpisodeRoleSchema, guest: EpisodeRoleSchema }, {
    additionalProperties: false,
  }),
  provider: RepositoryConfigSchema.properties.provider,
  approved_script_sha256: Type.Optional(Sha256Schema),
  approved_audio_sha256: Type.Optional(Sha256Schema),
}, { $id: "episode.schema.json", additionalProperties: false });
export type Episode = Static<typeof EpisodeSchema>;

export const TemplateSchema = Type.Object({
  schema_version: Type.Literal(1),
  id: Type.String(),
  version: Type.String(),
  title: Type.String(),
  default_locale: Type.String(),
  supported_locales: Type.Array(Type.String()),
  roles: Type.Record(Type.String(), Type.Object({
    voice: Type.String(),
    allowed_intents: Type.Array(Type.String()),
  }, { additionalProperties: false })),
  sections: Type.Array(Type.Object({
    id: Type.String(),
    required: Type.Boolean(),
    repeatable: Type.Optional(Type.Boolean()),
  }, { additionalProperties: false })),
  pipeline: Type.Array(PassIdSchema),
  placeholder_types: Type.Array(Type.String()),
}, { $id: "template.schema.json", additionalProperties: false });
export type PodcastTemplate = Static<typeof TemplateSchema>;

export const LocalePackSchema = Type.Object({
  schema_version: Type.Literal(1),
  locale: Type.String(),
  base_wpm: Type.Number({ exclusiveMinimum: 0 }),
  pace_multipliers: Type.Record(Type.String(), Type.Number({ exclusiveMinimum: 0 })),
  delivery: Type.Object({
    tone: Type.Array(Type.String()),
    pace: Type.Array(Type.String()),
    emphasis: Type.Array(Type.String()),
    pause_after: Type.Array(Type.String()),
  }, { additionalProperties: false }),
  register: Type.String(),
}, { $id: "locale-pack.schema.json", additionalProperties: false });
export type LocalePack = Static<typeof LocalePackSchema>;

export const SourceMapSchema = Type.Object({
  schema_version: Type.Literal(1),
  source_sha256: Sha256Schema,
  blocks: Type.Array(Type.Object({
    id: Type.String(),
    sha256: Sha256Schema,
    text: Type.String(),
  }, { additionalProperties: false })),
}, { $id: "source-map.schema.json", additionalProperties: false });
export type SourceMap = Static<typeof SourceMapSchema>;

export const EventSchema = Type.Object({
  schema_version: Type.Literal(1),
  sequence: Type.Integer({ minimum: 1 }),
  at: Type.String(),
  action: Type.String(),
  episode: Type.String(),
  input_sha256: Type.Optional(Type.String()),
  output_sha256: Type.Optional(Type.String()),
  pass: Type.Optional(PassIdSchema),
  attempt: Type.Optional(Type.Integer({ minimum: 1 })),
  details: Type.Optional(StringMapSchema),
}, { $id: "event.schema.json", additionalProperties: false });
export type PodcastEvent = Static<typeof EventSchema>;

export const StateSchema = Type.Object({
  schema_version: Type.Literal(1),
  episode: Type.String(),
  phase: Type.String(),
  current_pass: Type.Optional(PassIdSchema),
  candidate_path: Type.Optional(Type.String()),
  candidate_sha256: Type.Optional(Type.String()),
  approved_script_sha256: Type.Optional(Type.String()),
  audio_plan_sha256: Type.Optional(Type.String()),
  events: Type.Integer({ minimum: 0 }),
}, { $id: "state.schema.json", additionalProperties: false });
export type PodcastState = Static<typeof StateSchema>;
