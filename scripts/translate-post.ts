#!/usr/bin/env -S pnpm exec tsx

import { GoogleGenAI } from "@google/genai";
import matter from "gray-matter";
import { spawn } from "node:child_process";
import { readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const MODEL = process.env.GEMINI_TRANSLATION_MODEL ?? "gemini-2.5-flash";
export const VERTEX_LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? "global";

type Translation = {
  title: string;
  description: string;
  content: string;
  attribution: string;
};
type Source = {
  absolute: string;
  slug: string;
  data: Record<string, unknown>;
  content: string;
};

function commandOutput(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const running = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    running.stdout.on("data", (data: Buffer) => stdout += data.toString());
    running.stderr.on("data", (data: Buffer) => stderr += data.toString());
    running.on("error", reject);
    running.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${command} failed (${code}): ${stderr.trim()}`));
    });
  });
}

async function resolveGoogleCloudProject(): Promise<string> {
  const configured = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (configured) return configured;
  try {
    const project = await commandOutput("gcloud", [
      "config",
      "get-value",
      "project",
      "--quiet",
    ]);
    if (project && project !== "(unset)") return project;
  } catch {
    // The error below covers both a missing CLI and an unset project.
  }
  throw new Error(
    "No Google Cloud project found. Set GOOGLE_CLOUD_PROJECT or run `gcloud config set project PROJECT_ID`.",
  );
}

export function normalizeLanguage(
  value: string,
): { code: string; name: string } {
  let locale: Intl.Locale;
  try {
    locale = new Intl.Locale(value);
  } catch {
    throw new Error(`Invalid target language: ${value}`);
  }
  const code = locale.toString().toLowerCase();
  if (code === "en" || code.startsWith("en-")) {
    throw new Error("The source posts are already in English.");
  }
  const name = new Intl.DisplayNames(["en"], { type: "language" }).of(code);
  if (!name) throw new Error(`Unknown target language: ${value}`);
  return { code, name };
}

async function resolveSource(input: string): Promise<Source> {
  const postsDirectory = await realpath(path.resolve("posts"));
  const absolute = await realpath(path.resolve(input));
  const relative = path.relative(postsDirectory, absolute);
  if (
    !relative || relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative) ||
    path.extname(relative).toLowerCase() !== ".md" ||
    path.dirname(relative) !== "."
  ) {
    throw new Error("Input must be a Markdown file directly inside posts/.");
  }
  const parsed = matter(await readFile(absolute, "utf8"));
  if (parsed.data.translationOf) {
    throw new Error("Translate the original English post, not a translation.");
  }
  if (typeof parsed.data.title !== "string" || !parsed.data.title.trim()) {
    throw new Error("The source post must have a front-matter title.");
  }
  return {
    absolute,
    slug: path.basename(relative, path.extname(relative)),
    data: parsed.data,
    content: parsed.content,
  };
}

export function translationPrompt(
  source: Pick<Source, "content" | "data">,
  languageName: string,
): string {
  const description = typeof source.data.description === "string"
    ? source.data.description
    : "";
  return `Translate this blog post from English to ${languageName}.

Return a faithful, fluent translation. Preserve the Markdown structure exactly:
- Do not translate URLs, link destinations, image paths, HTML attributes, code blocks, inline code, or technical identifiers.
- Translate headings, prose, link labels, image alt text, and block quotes.
- Do not add, remove, summarize, explain, or wrap the Markdown in a code fence.
- Translate the sentence "This article was translated with ${MODEL}." into ${languageName} and return it in the attribution field. Keep the model identifier "${MODEL}" unchanged.
- Return the title, description, Markdown body, and attribution in the requested JSON fields.

<title>${source.data.title}</title>
<description>${description}</description>
<markdown>
${source.content.trim()}
</markdown>`;
}

export function renderTranslation(
  source: Pick<Source, "slug" | "data">,
  language: { code: string; name: string },
  translation: Translation,
): string {
  const data = {
    ...source.data,
    title: translation.title.trim(),
    description: translation.description.trim(),
    lang: language.code,
    languageName: language.name,
    translationModel: MODEL,
    translationOf: `/posts/${source.slug}/`,
    url: `/posts/${source.slug}/${language.code}/`,
  };
  const body = translation.content.trim();
  if (!body) throw new Error("Gemini returned an empty Markdown body.");
  const attribution = translation.attribution.trim();
  if (!attribution.includes(MODEL)) {
    throw new Error(
      `Gemini returned an attribution without the model identifier ${MODEL}.`,
    );
  }
  return matter.stringify(`${body}\n\n---\n\n_${attribution}_\n`, data);
}

async function translate(
  ai: GoogleGenAI,
  source: Source,
  languageName: string,
): Promise<Translation> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: translationPrompt(source, languageName),
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "content", "attribution"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          content: { type: "string" },
          attribution: { type: "string" },
        },
      },
    },
  });
  if (!response.text) throw new Error("Gemini returned no translation.");
  const result = JSON.parse(response.text) as Partial<Translation>;
  if (
    typeof result.title !== "string" ||
    typeof result.description !== "string" ||
    typeof result.content !== "string" ||
    typeof result.attribution !== "string"
  ) {
    throw new Error("Gemini returned an invalid translation response.");
  }
  return result as Translation;
}

function parseArguments(
  args: string[],
): { input: string; language: string; force: boolean } {
  const force = args.includes("--force");
  const positional = args.filter((argument) => argument !== "--force");
  if (positional.length !== 2) {
    throw new Error(
      "Usage: pnpm translate-post <posts/file.md> <language-code> [--force]",
    );
  }
  return { input: positional[0], language: positional[1], force };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseArguments(args);
  const language = normalizeLanguage(options.language);
  const source = await resolveSource(options.input);
  const output = path.join(
    path.dirname(source.absolute),
    `${source.slug}.${language.code}.md`,
  );
  if (!options.force) {
    try {
      await readFile(output);
      throw new Error(
        `${
          path.relative(process.cwd(), output)
        } already exists. Use --force to replace it.`,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  const project = await resolveGoogleCloudProject();
  const ai = new GoogleGenAI({
    vertexai: true,
    project,
    location: VERTEX_LOCATION,
  });
  console.log(
    `Translating ${path.basename(source.absolute)} to ${language.name}...`,
  );
  const translated = await translate(ai, source, language.name);
  const markdown = renderTranslation(source, language, translated);
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, markdown);
  await rename(temporary, output);
  console.log(`Created ${path.relative(process.cwd(), output)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
