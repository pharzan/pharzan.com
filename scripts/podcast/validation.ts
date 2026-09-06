import Ajv from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PodcastError } from "./domain.ts";

const AjvConstructor = Ajv as unknown as new (options: Record<string, unknown>) => {
  compile: (schema: object) => ((value: unknown) => boolean) & { errors?: unknown };
  errorsText: (errors?: unknown) => string;
};

export async function assertSchema(repositoryRoot: string, schemaName: string, value: unknown): Promise<void> {
  const filename = path.join(repositoryRoot, "schemas", "podcast", "v1", schemaName);
  const schema = JSON.parse(await readFile(filename, "utf8")) as object;
  const ajv = new AjvConstructor({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(value)) throw new PodcastError(`${schemaName} validation failed: ${ajv.errorsText(validate.errors)}`, "INTEGRITY");
}
