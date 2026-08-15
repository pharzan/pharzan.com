# pharzan.com

Source code for [pharzan.com](https://pharzan.com), Farzan Tinati's personal website and blog.

The site is built with [Lume](https://lume.land/) and [Deno](https://deno.com/) and deployed to Firebase Hosting.

## Prerequisites

- [Deno](https://docs.deno.com/runtime/getting_started/installation/)
- [Node.js](https://nodejs.org/) 20 or newer and [pnpm](https://pnpm.io/) for audio generation
- [Firebase CLI](https://firebase.google.com/docs/cli) for deployment
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) for Vertex AI authentication
- ImageMagick on Linux, or `sips` on macOS, for image optimization and deployment
- [ffmpeg](https://ffmpeg.org/) for audio generation

## Getting started

Clone the repository and start the local development server:

```sh
git clone https://github.com/pharzan/pharzan.com.git
cd pharzan.com
deno task serve
```

Lume will print the local URL in the terminal and rebuild the site when source files change.

## Available commands

| Command | Description |
| --- | --- |
| `deno task serve` | Start the local development server |
| `deno task build` | Generate the production site in `_site/` |
| `deno task prepare` | Optimize images and generate the production site |
| `deno task cms` | Start the Lume CMS |
| `deno task new-post <filename> <title> <description>` | Create a post in `posts/` |
| `deno task optimize-images` | Resize and optimize images in `assets/` |
| `deno task setup-hooks` | Configure the repository's Git hooks |
| `deno task deploy` | Optimize images, build, and deploy to Firebase Hosting |
| `pnpm generate-audio posts/<slug>.md` | Generate and cache an MP3 narration for one post |
| `pnpm translate-post posts/<slug>.md <language>` | Translate one post with Gemini |

The same commands are available through `make`:

```sh
make help
make serve
make build
make prepare
make deploy
```

For example, to create a post:

```sh
deno task new-post hello-world "Hello, world" "A short description of the post"

# Or with Make
make new-post SLUG=hello-world TITLE="Hello, world" DESCRIPTION="A short description of the post"
```

## Project structure

```text
.
├── _config.ts          # Lume configuration and plugins
├── _includes/          # Shared page layouts
├── assets/             # Styles, images, icons, and downloadable files
├── posts/              # Blog posts written in Markdown
├── scripts/            # Content and asset utility scripts
├── index.vto           # Home page
├── me.md               # About page
└── firebase.json       # Firebase Hosting configuration
```

## Writing posts

Posts live in `posts/` and use YAML front matter. A typical post starts with:

```yaml
---
layout: layout.vto
title: Post title
description: "A concise description for search engines and link previews"
bodyClass: me-page
date: 2026-01-01 12:00
tags: [example]
---
```

Use the `new-post` task to generate this structure automatically. Add post images under `assets/images/` and run `deno task optimize-images` before committing large image files.

## Generate post audio

Install the Node dependencies, select a billed Google Cloud project with the Vertex AI API enabled, and create Application Default Credentials (ADC):

```sh
pnpm install
gcloud config set project PROJECT_ID
gcloud services enable aiplatform.googleapis.com
gcloud auth application-default login
pnpm generate-audio posts/example.md
```

The command uses ADC to authenticate to Vertex AI. It reads the project from `GOOGLE_CLOUD_PROJECT` when set, otherwise it uses the active `gcloud` project; `GOOGLE_CLOUD_LOCATION` is optional and defaults to `global`.

It extracts the human-readable parts of the post, splits long articles at prose boundaries, generates narration with `gemini-2.5-pro-tts`, and writes `assets/audio/example.mp3`. It excludes front matter, code blocks, images, HTML, and raw URLs. The embedded narration direction uses the `Orus` voice with an engaging, persuasive, low-pitch delivery.

Generated MP3 files and their `.audio-cache/<slug>.json` history are intended to be committed. The history stores every generation attempt, token usage, and its estimated USD cost. Temporary resumable chunks under `.audio-cache/chunks/` are ignored by Git. Unchanged content is skipped; regenerate it explicitly with:

```sh
pnpm generate-audio posts/example.md --force
```

Cost figures are estimates based on the pricing constants in `scripts/generate-audio.ts`; Cloud Billing remains the authoritative source. The command requires `ffmpeg` and outputs a mono, 24 kHz, 64 kbps MP3.

Translated posts can be narrated in the same way:

```sh
pnpm generate-audio posts/example.fa.md
```

This creates `assets/audio/example.fa.mp3`. The player appears automatically on `/posts/example/fa/` when that file exists. Language availability and launch readiness depend on the Gemini TTS model; some languages, including Persian, are currently Preview.

Persian translations automatically use a contemporary Iranian conversational delivery with natural spoken pronunciation and contractions instead of the standard narrator style. Regenerate an existing Persian MP3 after changing the source or delivery prompt:

```sh
pnpm generate-audio posts/example.fa.md --force
```

## Translate a post

Translation uses the same Google Cloud project, Vertex AI API, and Application Default Credentials as audio generation. Pass a BCP 47 language code such as `nb`, `fr`, or `pt-BR`:

```sh
pnpm translate-post posts/example.md nb
```

The command translates the title, description, and human-readable Markdown while asking Gemini to preserve code, URLs, link destinations, image paths, HTML attributes, and Markdown structure. It appends a sentence in the target language identifying the model used for translation. It creates `posts/example.nb.md`, served at `/posts/example/nb/`. When one or more translations exist, the article displays language badges linking between the English original and every translation.

Existing translation files are not overwritten unless explicitly requested:

```sh
pnpm translate-post posts/example.md nb --force
```

Set `GEMINI_TRANSLATION_MODEL` to override the default `gemini-2.5-flash` model.

## Deployment

Authenticate the Firebase CLI, then run:

```sh
firebase login
deno task deploy
```

The deploy task optimizes images, builds `_site/`, and publishes the default Firebase Hosting site. The GitHub Actions deployment uses the same preparation task.
