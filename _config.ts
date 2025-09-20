import lume from "lume/mod.ts";
import metas from "lume/plugins/metas.ts";
import sitemap from "lume/plugins/sitemap.ts";
import feed from "lume/plugins/feed.ts";
import search from "lume/plugins/search.ts";

const site = lume({
    location: new URL("https://pharzan.com"),
});

site.use(feed({ output: ["/feed.xml"] }));
site.copy("assets");
site.use(metas());
site.use(sitemap());
site.use(search());

export default site;