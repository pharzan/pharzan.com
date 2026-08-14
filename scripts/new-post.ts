// Usage: deno task new-post <filename> <title> <description>

const args = Deno.args;

if (args.length !== 3) {
  console.log("Usage: deno task new-post <filename> <title> <description>");
  console.log(
    'Example: deno task new-post my-new-post "My New Post" "This is a new post"',
  );
  console.log("\nNote: Exactly three arguments are required.");
  Deno.exit(1);
}

const [filename, title, description] = args;

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(filename)) {
  console.error(
    "Error: Filename must be a lowercase slug containing only letters, numbers, and hyphens.",
  );
  Deno.exit(1);
}

if (!title.trim() || /[\r\n]/.test(title)) {
  console.error("Error: Title must be non-empty and fit on one line.");
  Deno.exit(1);
}

if (!description.trim()) {
  console.error(
    "Error: Description is required for SEO. Please provide a unique, descriptive meta description.",
  );
  Deno.exit(1);
}

const date = new Date().toISOString().slice(0, 16).replace("T", " ");

const filepath = `posts/${filename}.md`;

const content = `---
layout: layout.vto
title: ${JSON.stringify(title)}
description: ${JSON.stringify(description)}
bodyClass: me-page
date: ${date}
---

# ${title}

`;

try {
  await Deno.writeTextFile(filepath, content, { createNew: true });
} catch (error) {
  if (error instanceof Deno.errors.AlreadyExists) {
    console.error(`Error: File ${filepath} already exists`);
    Deno.exit(1);
  }

  throw error;
}

console.log(`Created new post: ${filepath}`);
