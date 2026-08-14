new-post:
	deno run --allow-write=posts scripts/new-post.ts

optimize-images:
	deno run --allow-read --allow-write --allow-run scripts/optimize-images.ts

setup-hooks:
	bash scripts/setup-hooks.sh
