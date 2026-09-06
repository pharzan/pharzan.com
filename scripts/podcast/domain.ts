export const EXIT = {
  OK: 0,
  INVALID: 2,
  BLOCKED: 3,
  EXTERNAL: 4,
  INCOMPLETE: 5,
  INTEGRITY: 6,
  INTERRUPTED: 130,
} as const;

export type ExitSymbol = keyof typeof EXIT;

export class PodcastError extends Error {
  constructor(
    message: string,
    readonly symbol: ExitSymbol = "INVALID",
    readonly recovery?: string,
  ) {
    super(message);
    this.name = "PodcastError";
  }
}

export type PassId = SchemaPassId;
export const PASS_ORDER: PassId[] = ["structure", "content", "performance"];
export type EpisodeConfig = Episode;
export type EventRecord = PodcastEvent;
export type DerivedState = PodcastState;
export type Review = PassReview;
export type EditingResponse = PassResponse;
import type {
  Episode,
  PassId as SchemaPassId,
  PassResponse,
  PassReview,
  PodcastEvent,
  PodcastState,
} from "./schemas/index.ts";
