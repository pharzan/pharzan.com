# pharzan.com

Source code for [pharzan.com](https://pharzan.com), Farzan Tinati's personal website and blog.

The site is built with [Lume](https://lume.land/) and [Deno](https://deno.com/) and deployed to Firebase Hosting.

## Prerequisites

- [Deno](https://docs.deno.com/runtime/getting_started/installation/)
- [Firebase CLI](https://firebase.google.com/docs/cli) for deployment
- ImageMagick on Linux, or `sips` on macOS, for image optimization and deployment

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

## Deployment

Authenticate the Firebase CLI, then run:

```sh
firebase login
deno task deploy
```

The deploy task optimizes images, builds `_site/`, and publishes the default Firebase Hosting site. The GitHub Actions deployment uses the same preparation task.
