// Usage: deno task new-post <filename> <title> <description>

const args = Deno.args;

if (args.length < 3) {
  console.log("Usage: deno task new-post <filename> <title> <description>");
  console.log('Example: deno task new-post my-new-post "My New Post" "This is a new post"');
  console.log("\nNote: All three arguments are required for SEO best practices.");
  Deno.exit(1);
}

const filename = args[0];
const title = args[1];
const description = args[2];

if (!description || description.trim() === "") {
  console.error("Error: Description is required for SEO. Please provide a unique, descriptive meta description.");
  Deno.exit(1);
}

const date = new Date().toISOString().slice(0, 16).replace("T", " ");

const filepath = `posts/${filename}.md`;

// Check if file exists
try {
  await Deno.stat(filepath);
  console.error(`Error: File ${filepath} already exists`);
  Deno.exit(1);
} catch {
  // File doesn't exist, continue
}

const content = `---
layout: layout.vto
title: ${title}
description: "${description}"
bodyClass: me-page
date: ${date}
---

# ${title}

`;

await Deno.writeTextFile(filepath, content);
console.log(`Created new post: ${filepath}`);
