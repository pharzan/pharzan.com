import lume from "lume/mod.ts";
import metas from "lume/plugins/metas.ts";
import sitemap from "lume/plugins/sitemap.ts";
import feed from "lume/plugins/feed.ts";
import search from "lume/plugins/search.ts";
import date from "lume/plugins/date.ts";
import codeHighlight from "lume/plugins/code_highlight.ts";
import inline from "lume/plugins/inline.ts";
import llms from "https://deno.land/x/lume_plugin_llms@v0.1.2/mod.ts";

const site = lume({
  location: new URL("https://pharzan.com"),
});

site.ignore("README.md");
site.ignore("package.json");
site.ignore("pnpm-lock.yaml");
site.ignore("pnpm-workspace.yaml");
site.ignore("tsconfig.json");
site.ignore(".audio-cache");

site.filter("readingTime", (content: string) => {
  const words = content
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-zA-Z0-9#]+;/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.ceil(words / 200));
});

const postAudio = new Map<string, string>();

try {
  for (const entry of Deno.readDirSync("./assets/audio")) {
    if (!entry.isFile || !entry.name.endsWith(".mp3")) continue;

    const slug = entry.name.slice(0, -".mp3".length);
    postAudio.set(`/posts/${slug}/`, `/assets/audio/${entry.name}`);
  }
} catch (error) {
  if (!(error instanceof Deno.errors.NotFound)) throw error;
}

site.filter("postAudio", (url: string) => postAudio.get(url) ?? "");

site.use(feed({
  output: "/feed.xml",
  query: "url^=/posts/",
  sort: "date=desc",
  info: {
    title: "Farzan Tinati",
    description: "Notes on product development, technology, and growth.",
  },
}));
site.copy("assets");
site.copy("404.html");
site.use(metas());
site.use(sitemap());
site.use(search());
site.use(date());
site.use(codeHighlight());
site.use(inline());
site.use(llms());

export default site;
