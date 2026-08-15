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

type PostTranslation = {
  code: string;
  label: string;
  url: string;
};

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
const rtlLanguages = new Set([
  "ar",
  "arc",
  "ckb",
  "dv",
  "fa",
  "he",
  "khw",
  "ks",
  "ku",
  "nqo",
  "ps",
  "sd",
  "ug",
  "ur",
  "yi",
]);
const rtlScripts = new Set([
  "Adlm",
  "Arab",
  "Hebr",
  "Nkoo",
  "Rohg",
  "Syrc",
  "Thaa",
]);

site.filter("textDirection", (language?: string) => {
  try {
    const locale = new Intl.Locale(language || "en");
    return rtlLanguages.has(locale.language) ||
        (locale.script ? rtlScripts.has(locale.script) : false)
      ? "rtl"
      : "ltr";
  } catch {
    return "ltr";
  }
});

site.filter("postTranslations", (originalUrl: string) => {
  const slug = originalUrl.match(/^\/posts\/([^/]+)\/$/)?.[1];
  if (!slug) return [];

  const translations: PostTranslation[] = [];
  try {
    for (const entry of Deno.readDirSync("./posts")) {
      if (!entry.isFile) continue;
      const match = entry.name.match(
        /^(.+)\.([a-z]{2,3}(?:-[a-z0-9]{2,8})*)\.md$/i,
      );
      if (!match || match[1] !== slug) continue;

      const code = match[2].toLowerCase();
      translations.push({
        code,
        label: languageNames.of(code) ?? code.toUpperCase(),
        url: `/posts/${slug}/${code}/`,
      });
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }

  return [
    { code: "en", label: "English", url: originalUrl },
    ...translations.sort((a, b) => a.code.localeCompare(b.code)),
  ];
});

site.filter("readingTime", (content: string) => {
  const words = content
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-zA-Z0-9#]+;/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.ceil(words / 200));
});

site.filter("postAudio", (url: string) => {
  const translation = url.match(
    /^\/posts\/([a-z0-9][a-z0-9-]*)\/([a-z]{2,3}(?:-[a-z0-9]{2,8})*)\/$/i,
  );
  const original = url.match(/^\/posts\/([a-z0-9][a-z0-9-]*)\/$/i);
  const filename = translation
    ? `${translation[1]}.${translation[2].toLowerCase()}.mp3`
    : original
    ? `${original[1]}.mp3`
    : undefined;
  if (!filename) return "";

  try {
    const file = Deno.statSync(`./assets/audio/${filename}`);
    return file.isFile ? `/assets/audio/${filename}` : "";
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return "";
    throw error;
  }
});

site.use(feed({
  output: "/feed.xml",
  query: "url^=/posts/ translationOf=undefined",
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
