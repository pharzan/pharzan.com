import lume from "lume/mod.ts";
import metas from "lume/plugins/metas.ts";
import sitemap from "lume/plugins/sitemap.ts";
import feed from "lume/plugins/feed.ts";
import search from "lume/plugins/search.ts";
import date from "lume/plugins/date.ts";
import codeHighlight from "lume/plugins/code_highlight.ts";
import inline from "lume/plugins/inline.ts";

const site = lume({
    location: new URL("https://pharzan.com"),
});

site.use(feed({ output: ["/feed.xml"] }));
site.copy("assets");
site.copy("404.html");
site.use(metas());
site.use(sitemap());
site.use(search());
site.use(date());
site.use(codeHighlight());
site.use(inline());
export default site;