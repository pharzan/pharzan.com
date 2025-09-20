---
layout: layout.vto
title: Setup a minimal blog in less than 15 minutes
description: "Create a minimal blog in less than 15 minutes"
bodyClass: me-page
---
# Create a minimal blog in less than 15 minutes

I decided to create a [blog](/posts/first-post) and the challenge is to create a minimal blog in less than 15 minutes.

I decided to go with something fast, with easy setup. Quick—think: what can be lightweight and get me what I want?

I’ve experimented with Deno before, and in my head Deno is the cooler, hip brother of Node. I wanted to use it, so Deno was chosen.

Created a new folder and searched for a static site generator for Deno. First result? [https://lume.land/](https://lume.land/)—so I chose that.

Now to figure out how to organize and configure the code.

---

## Reproduce This Setup (DIY)
### 1) Prereqs
- Install [Deno](https://deno.com/manual/getting_started/installation).
### 2) Scaffold the project
```bash
mkdir my-blog && cd my-blog
deno run -A https://lume.land/init.ts
```
This will create _cms.ts, _config.ts and deno.json and you can run the serve task to spin up the dev server.
### 3) Configure the pages
Add a new file named `index.vto` which will handle the posts.
The posts will go unde the /posts folder and I want lume to fetch any .md file within that folder and show it to the user.
Eventually I ended up with something like the below file for the contents of index.vto
```
<a href="/me"> About me</a>
<hr />

{{ for post of search.pages("url^=/posts/") }}
  <article class="post-summary">
    <h3><a href="{{ post.url }}">{{ post.title }}</a></h3>
    <div class="post-description">
    <p>{{ post.description }}</p>
    </div>
  </article>
  <hr />
{{ /for }}
```
Finally would be to add some styles and to deploy it.
Quickest and one of the easiest ways to deploy is to use firebase. All you need to do is to make sure you have firebase installed.
Login to firebase in your cli and initialize hosting.

Make sure you create the firebase project from the firebase console.

```
firebase login
firebase init hosting
```
Once you have done these steps you can deploy with
```
firebase deploy --only hosting
```
A last touch would be to configure github actions to auto deploy. Which means whenever we merge changes to git on main we get the latest deployed version.

To get the configuration for this you can run `firebase init`and select Hosting: Set up GitHub Action deploys. This will create two files under .github/workflows.

These files are for node and we need to make some changes for it to work with out Deno project.
using the deno image we can run our `deno task build` command to build the project.

I am happy for now but will definitely improve this blog as I go along.