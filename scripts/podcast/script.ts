import matter from "gray-matter";
import { PodcastError } from "./domain.ts";
import { sha256 } from "./io.ts";

const TURN = /^###\s+([a-z0-9][a-z0-9-]*)\s*\|\s*(host|guest|co_host)\s*\|\s*([a-z_]+)\s*$/;
const SECTION = /^##\s+([a-z0-9][a-z0-9_:-]*)\s*$/;
const DELIVERY = /^<!--\s*delivery:\s*(.*?)\s*-->$/;
const PLACEHOLDER = /\{\{([A-Z]+):([a-z0-9][a-z0-9-]*)\s*\|[^}]+}}/g;
const WORD = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

export type Turn = {
  id: string;
  role: "host" | "guest" | "co_host";
  intent: string;
  section: string;
  delivery: Record<string, string>;
  spoken: string;
};

export type ParsedScript = { frontmatter: Record<string, unknown>; turns: Turn[]; sections: string[] };

export function parseScript(markdown: string): ParsedScript {
  const parsed = matter(markdown);
  const lines = parsed.content.replace(/\r\n/g, "\n").split("\n");
  const turns: Turn[] = [];
  const sections: string[] = [];
  let section = "";
  let current: Turn | undefined;

  const finish = () => {
    if (!current) return;
    current.spoken = current.spoken.trim();
    if (!current.spoken) throw new PodcastError(`Turn ${current.id} has no spoken content.`);
    turns.push(current);
    current = undefined;
  };

  for (const line of lines) {
    const sectionMatch = line.match(SECTION);
    if (sectionMatch) {
      finish(); section = sectionMatch[1]!; sections.push(section); continue;
    }
    const turnMatch = line.match(TURN);
    if (turnMatch) {
      finish();
      if (!section) throw new PodcastError(`Turn ${turnMatch[1]} appears before a section.`);
      current = { id: turnMatch[1]!, role: turnMatch[2] as Turn["role"], intent: turnMatch[3]!, section, delivery: {}, spoken: "" };
      continue;
    }
    const deliveryMatch = line.match(DELIVERY);
    if (deliveryMatch && current) {
      for (const item of deliveryMatch[1]!.split(";")) {
        const [key, value] = item.split("=").map((part) => part.trim());
        if (key && value) current.delivery[key] = value;
      }
      continue;
    }
    if (current && !/^<!--/.test(line)) current.spoken += `${line}\n`;
  }
  finish();
  if (!turns.length) throw new PodcastError("The script contains no valid turns.");
  const ids = turns.map((turn) => turn.id);
  if (new Set(ids).size !== ids.length) throw new PodcastError("Turn IDs must be unique.");
  return { frontmatter: parsed.data, turns, sections };
}

export function placeholders(markdown: string): Array<{ type: string; id: string }> {
  return [...markdown.matchAll(PLACEHOLDER)].map((match) => ({ type: match[1]!, id: match[2]! }));
}

export function spokenText(turn: Turn): string {
  return turn.spoken.replace(PLACEHOLDER, "").replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
}

export function estimateDuration(markdown: string): { schema_version: 1; algorithm_version: 1; input_sha256: string; words: number; seconds: number; display: string; minutes: number } {
  const script = parseScript(markdown);
  let seconds = 0;
  let words = 0;
  for (const turn of script.turns) {
    const count = spokenText(turn).match(WORD)?.length ?? 0;
    words += count;
    const pace = { slow: 0.8, measured: 0.9, conversational: 1, brisk: 1.15 }[turn.delivery.pace ?? "conversational"] ?? 1;
    seconds += count / (150 * pace) * 60;
  }
  const rounded = Math.round(seconds);
  return { schema_version: 1, algorithm_version: 1, input_sha256: sha256(markdown), words, seconds: rounded, display: `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`, minutes: Number((rounded / 60).toFixed(2)) };
}

export function validateFinalScript(markdown: string): ParsedScript {
  const script = parseScript(markdown);
  const open = placeholders(markdown);
  if (open.length) throw new PodcastError(`Final script has ${open.length} unresolved placeholder(s).`, "BLOCKED");
  if (script.turns.some((turn) => turn.role === "co_host")) throw new PodcastError("V1 audio supports exactly host and guest; co_host is not supported.", "BLOCKED");
  return script;
}
