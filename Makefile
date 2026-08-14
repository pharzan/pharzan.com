.DEFAULT_GOAL := help

.PHONY: help serve build prepare cms deploy new-post optimize-images setup-hooks

help:
	@echo "Available commands:"
	@echo "  make serve            Start the local development server"
	@echo "  make build            Build the site into _site/"
	@echo "  make prepare          Optimize images and build the site"
	@echo "  make cms              Start the Lume CMS"
	@echo "  make deploy           Optimize images, build, and deploy"
	@echo "  make optimize-images  Optimize images in assets/"
	@echo "  make setup-hooks      Configure the repository Git hooks"
	@echo "  make new-post SLUG=hello-world TITLE='Hello' DESCRIPTION='Post description'"

serve:
	deno task serve

build:
	deno task build

prepare:
	deno task prepare

cms:
	deno task cms

deploy:
	deno task deploy

new-post:
	deno task new-post "$(SLUG)" "$(TITLE)" "$(DESCRIPTION)"

optimize-images:
	deno task optimize-images

setup-hooks:
	deno task setup-hooks
