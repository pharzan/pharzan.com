export * from "./audio.ts";
export * from "./core.ts";
export * from "./editing.ts";
export * from "./shared.ts";

import {
  AssemblySchema,
  AudioPlanSchema,
  CliResultSchema,
  FinalAudioManifestSchema,
  FinalScriptManifestSchema,
  SceneCandidateSchema,
} from "./audio.ts";
import {
  EpisodeSchema,
  EventSchema,
  LocalePackSchema,
  RepositoryConfigSchema,
  SourceMapSchema,
  StateSchema,
  TemplateSchema,
} from "./core.ts";
import {
  AnswersSchema,
  PassResponseSchema,
  ResearchResponseSchema,
  ReviewSchema,
} from "./editing.ts";

export const GeneratedPodcastSchemas = {
  "repository-config.schema.json": RepositoryConfigSchema,
  "episode.schema.json": EpisodeSchema,
  "template.schema.json": TemplateSchema,
  "locale-pack.schema.json": LocalePackSchema,
  "source-map.schema.json": SourceMapSchema,
  "event.schema.json": EventSchema,
  "state.schema.json": StateSchema,
  "pass-response.schema.json": PassResponseSchema,
  "review.schema.json": ReviewSchema,
  "answers.schema.json": AnswersSchema,
  "research-response.schema.json": ResearchResponseSchema,
  "audio-plan.schema.json": AudioPlanSchema,
  "scene-candidate.schema.json": SceneCandidateSchema,
  "assembly.schema.json": AssemblySchema,
  "final-script-manifest.schema.json": FinalScriptManifestSchema,
  "final-audio-manifest.schema.json": FinalAudioManifestSchema,
  "cli-result.schema.json": CliResultSchema,
} as const;
