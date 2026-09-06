import { Static, Type } from "@sinclair/typebox";
import { PassIdSchema, StringArraySchema } from "./shared.ts";

const OpenMetadataSchema = Type.Object({}, { additionalProperties: true });

export const SourceCoverageSchema = Type.Object({
  source_id: Type.String(),
  outcome: Type.Union([
    Type.Literal("mapped"),
    Type.Literal("deferred"),
    Type.Literal("proposed_removal"),
  ]),
  turn_ids: StringArraySchema,
}, { additionalProperties: false });

export const ChangeSchema = Type.Object({
  id: Type.String(),
  kind: Type.String(),
  turn_ids: StringArraySchema,
  substance_changed: Type.Boolean(),
  disposition_required: Type.Boolean(),
  rationale: Type.String(),
}, { additionalProperties: false });

export const PlaceholderSchema = Type.Object({
  id: Type.String(),
  type: Type.String(),
  turn_ids: StringArraySchema,
  status: Type.Union([Type.Literal("open"), Type.Literal("resolved")]),
  question: Type.String(),
}, { additionalProperties: false });

export const ClaimSchema = Type.Object({
  id: Type.String(),
  turn_ids: StringArraySchema,
  text: Type.String(),
  classification: Type.Union([
    Type.Literal("external_fact"),
    Type.Literal("personal_claim"),
    Type.Literal("opinion"),
    Type.Literal("prediction"),
  ]),
  material: Type.Boolean(),
  status: Type.String(),
  reason: Type.String(),
  sources: Type.Array(OpenMetadataSchema),
}, { additionalProperties: false });

export const ProposalSchema = Type.Object({
  id: Type.String(),
  type: Type.String(),
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("accepted"),
    Type.Literal("rejected"),
    Type.Literal("revised"),
    Type.Literal("deferred"),
  ]),
  affected_turn_ids: StringArraySchema,
  suggested_text: Type.String(),
  rationale: Type.String(),
  claim_ids: StringArraySchema,
}, { additionalProperties: false });

export const ValidationFindingSchema = Type.Object({
  code: Type.String(),
  severity: Type.Union([Type.Literal("warning"), Type.Literal("blocking")]),
  pass: Type.Boolean(),
  message: Type.String(),
}, { additionalProperties: false });

export const ReviewBodySchema = Type.Object({
  summary: Type.String(),
  source_coverage: Type.Array(SourceCoverageSchema),
  changes: Type.Array(ChangeSchema),
  placeholders: Type.Array(PlaceholderSchema),
  claims: Type.Array(ClaimSchema),
  proposals: Type.Array(ProposalSchema),
  validations: Type.Array(ValidationFindingSchema),
  security_findings: Type.Array(OpenMetadataSchema),
}, { additionalProperties: false });

export const ReviewSchema = Type.Composite([
  Type.Object({
    schema_version: Type.Literal(1),
    episode: Type.String(),
    pass: PassIdSchema,
    attempt: Type.Integer({ minimum: 1 }),
  }),
  ReviewBodySchema,
], { $id: "review.schema.json", additionalProperties: false });
export type PassReview = Static<typeof ReviewSchema>;

export const PassResponseSchema = Type.Object({
  candidate_markdown: Type.String({
    minLength: 1,
    pattern: "## [a-z0-9][a-z0-9_:-]*[\\s\\S]+### [a-z0-9][a-z0-9-]* \\| (host|guest) \\| [a-z_]+",
  }),
  review: ReviewBodySchema,
}, { $id: "pass-response.schema.json", additionalProperties: false });
export type PassResponse = Static<typeof PassResponseSchema>;

export const AnswersSchema = Type.Object({
  schema_version: Type.Literal(1),
  placeholders: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  proposals: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  claims: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
}, { $id: "answers.schema.json", additionalProperties: false });
export type AuthorAnswers = Static<typeof AnswersSchema>;

export const ResearchSourceSchema = Type.Object({
  url: Type.String({ pattern: "^https://" }),
  title: Type.String(),
  publisher: Type.Union([Type.String(), Type.Null()]),
  published_or_updated_at: Type.Union([Type.String(), Type.Null()]),
  accessed_at: Type.String(),
  evidence_note: Type.String(),
  source_type: Type.String(),
  primary_or_authoritative: Type.Boolean(),
}, { additionalProperties: false });

export const ResearchResponseSchema = Type.Object({
  schema_version: Type.Literal(1),
  run_id: Type.String(),
  claims: Type.Array(Type.Object({
    claim_id: Type.String(),
    verdict: Type.Union([
      Type.Literal("verified"),
      Type.Literal("verified_with_caveat"),
      Type.Literal("contradicted"),
      Type.Literal("conflicting_sources"),
      Type.Literal("not_found"),
    ]),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    reasoning: Type.String(),
    sources: Type.Array(ResearchSourceSchema),
  }, { additionalProperties: false })),
}, { $id: "research-response.schema.json", additionalProperties: false });
export type ResearchResponse = Static<typeof ResearchResponseSchema>;
