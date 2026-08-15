import assert from "node:assert/strict";
import test from "node:test";
import matter from "gray-matter";
import {
  MODEL,
  normalizeLanguage,
  renderTranslation,
  translationPrompt,
} from "./translate-post.ts";

test("normalizes a language code and rejects English", () => {
  assert.deepEqual(normalizeLanguage("NB-no"), {
    code: "nb-no",
    name: "Norwegian Bokmål (Norway)",
  });
  assert.throws(() => normalizeLanguage("en"), /already in English/);
});

test("the prompt asks Gemini to preserve Markdown implementation details", () => {
  const prompt = translationPrompt({
    data: { title: "Hello", description: "A greeting" },
    content: "Read [the docs](/docs) and use `const value = 1`.",
  }, "Norwegian");
  assert.match(prompt, /from English to Norwegian/);
  assert.match(prompt, /Do not translate URLs/);
  assert.match(prompt, /attribution field/);
  assert.ok(prompt.includes(MODEL));
  assert.match(prompt, /\[the docs\]\(\/docs\)/);
});

test("renders translated front matter and body with a language URL", () => {
  const markdown = renderTranslation(
    {
      slug: "hello",
      data: {
        layout: "layout.vto",
        title: "Hello",
        description: "Greeting",
        tags: ["personal"],
      },
    },
    { code: "nb", name: "Norwegian Bokmål" },
    {
      title: "Hei",
      description: "Hilsen",
      content: "# Hei\n\nVelkommen.",
      attribution: `Denne artikkelen ble oversatt med ${MODEL}.`,
    },
  );
  const parsed = matter(markdown);
  assert.equal(parsed.data.title, "Hei");
  assert.equal(parsed.data.lang, "nb");
  assert.equal(parsed.data.translationModel, MODEL);
  assert.equal(parsed.data.translationOf, "/posts/hello/");
  assert.equal(parsed.data.url, "/posts/hello/nb/");
  assert.deepEqual(parsed.data.tags, ["personal"]);
  assert.equal(
    parsed.content.trim(),
    `# Hei\n\nVelkommen.\n\n---\n\n_Denne artikkelen ble oversatt med ${MODEL}._`,
  );
});
