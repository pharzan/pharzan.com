import { Static, Type } from "@sinclair/typebox";

export const Sha256Schema = Type.String({ pattern: "^[a-f0-9]{64}$" });
export const NonEmptyStringSchema = Type.String({ minLength: 1 });
export const PassIdSchema = Type.Union([
  Type.Literal("structure"),
  Type.Literal("content"),
  Type.Literal("performance"),
]);
export type PassId = Static<typeof PassIdSchema>;
export const RoleIdSchema = Type.Union([
  Type.Literal("host"),
  Type.Literal("guest"),
  Type.Literal("co_host"),
]);
export const StringMapSchema = Type.Record(Type.String(), Type.Unknown());
export const StringArraySchema = Type.Array(Type.String());

export const GENERATED_SCHEMA_COMMENT =
  "Generated from scripts/podcast/schemas. Do not edit this JSON file directly.";
