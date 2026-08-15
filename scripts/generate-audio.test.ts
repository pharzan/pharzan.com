import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCost,
  chunkNarration,
  ENGLISH_CONVERSATIONAL_PROMPT,
  isRetryableError,
  markdownToNarration,
  NARRATION_PROMPT,
  narrationPromptForLanguage,
  PERSIAN_CONVERSATIONAL_PROMPT,
  TURKISH_CONVERSATIONAL_PROMPT,
} from "./generate-audio.ts";

test("extracts human-readable Markdown and removes implementation details", () => {
  const markdown = `---
title: "A useful article"
description: "Not part of the narration"
---
# A useful article

Read the [documentation](https://example.com/docs) and keep going 👉.

An exposed [https://example.com](https://example.com) should disappear.

![A diagram](/diagram.png)

<img src="/another-image.png" />

> A helpful quotation.

- First idea
- Second idea with \`inline code\`

\`\`\`ts
console.log("do not narrate this");
\`\`\`
`;

  assert.equal(
    markdownToNarration(markdown),
    [
      "A useful article",
      "Read the documentation and keep going.",
      "An exposed should disappear.",
      "A helpful quotation.",
      "First idea",
      "Second idea with inline code",
    ].join("\n\n"),
  );
});

test("adds the front-matter title when the body has no matching heading", () => {
  assert.equal(
    markdownToNarration(`---\ntitle: Missing title\n---\nBody copy.`),
    "Missing title\n\nBody copy.",
  );
});

test("uses the article H1 instead of reading a different metadata title first", () => {
  assert.equal(
    markdownToNarration(
      `---\ntitle: Metadata title\n---\n# Spoken title\n\nBody copy.`,
    ),
    "Spoken title\n\nBody copy.",
  );
});

test("chunks on prose boundaries and never exceeds the maximum", () => {
  const narration = [
    "One short paragraph.",
    "A second paragraph with several words in it.",
    "A final paragraph that also has enough words to split.",
  ].join("\n\n");
  const chunks = chunkNarration(narration, 55);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 55));
  assert.equal(chunks.join("\n\n"), narration);
});

test("splits a single oversized sentence without dropping text", () => {
  const narration = "one two three four five six seven eight nine ten";
  const chunks = chunkNarration(narration, 13);

  assert.ok(chunks.every((chunk) => chunk.length <= 13));
  assert.equal(chunks.join(" "), narration);
});

test("calculates the documented Pro TTS token price", () => {
  assert.equal(calculateCost(1_000_000, 1_000_000), 21);
  assert.equal(calculateCost(1_000, 25_000), 0.501);
});

test("retries only rate limits and temporary server failures", () => {
  for (const status of [429, 500, 502, 503, 504]) {
    assert.equal(isRetryableError({ status }), true);
  }
  for (const status of [400, 401, 403, 404, 413]) {
    assert.equal(isRetryableError({ status }), false);
  }
});

test("uses language-specific conversational delivery", () => {
  assert.equal(
    narrationPromptForLanguage("fa-IR"),
    PERSIAN_CONVERSATIONAL_PROMPT,
  );
  assert.match(PERSIAN_CONVERSATIONAL_PROMPT, /spoken Persian/);
  assert.match(PERSIAN_CONVERSATIONAL_PROMPT, /Avoid an audiobook/);
  assert.equal(
    narrationPromptForLanguage("tr-TR"),
    TURKISH_CONVERSATIONAL_PROMPT,
  );
  assert.match(TURKISH_CONVERSATIONAL_PROMPT, /spoken in Turkey/);
  assert.equal(
    narrationPromptForLanguage("en-GB"),
    ENGLISH_CONVERSATIONAL_PROMPT,
  );
  assert.equal(
    narrationPromptForLanguage(undefined),
    ENGLISH_CONVERSATIONAL_PROMPT,
  );
  assert.equal(narrationPromptForLanguage("fr"), NARRATION_PROMPT);
});
