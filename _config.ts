import lume from "lume/mod.ts";
import metas from "lume/plugins/metas.ts";
import sitemap from "lume/plugins/sitemap.ts";
import feed from "lume/plugins/feed.ts";
import search from "lume/plugins/search.ts";
import date from "lume/plugins/date.ts";

const site = lume({
    location: new URL("https://pharzan.com"),
});

site.use(feed({ output: ["/feed.xml"] }));
site.copy("assets");
site.use(metas());
site.use(sitemap());
site.use(search());
site.use(date());
export default site;