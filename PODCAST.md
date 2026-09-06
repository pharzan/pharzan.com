# Podcast workflow

The podcast tool turns an author draft into an approval-gated two-speaker
interview and then into native multi-speaker Vertex audio. It never runs the next
editing pass, research, synthesis, assembly, or publication implicitly.

## First episode

The requested test draft has been initialized as `ai-and-the-internet`:

```sh
pnpm podcast status ai-and-the-internet
pnpm podcast pass ai-and-the-internet structure --dry-run
```

Text editing and fact-checking use the authenticated `agy` CLI. A
non-interactive editing call needs an explicit invocation limit (up to one
initial call and two retries):

```sh
pnpm podcast pass ai-and-the-internet structure --yes --max-editing-invocations 3
```

The command writes a complete candidate and review under
`podcasts/ai-and-the-internet/.work/passes/structure/` and stops. Edit
`candidate.md` directly. Put placeholder answers and dispositions in
`.work/answers.yaml`. Starting the next pass approves and snapshots the current
candidate; rerunning a pass requires `--rerun`.

```sh
pnpm podcast pass ai-and-the-internet content --yes --max-editing-invocations 3
pnpm podcast pass ai-and-the-internet content --rerun --research \
  --yes --max-editing-invocations 3 --max-research-invocations 3
pnpm podcast pass ai-and-the-internet performance --yes --max-editing-invocations 3
pnpm podcast approve-script ai-and-the-internet
```

Editing and research use `agy` and store raw output only under ignored
`.work/`. The approved script and its manifest are placed in `final/`.

## Audio

Planning is local and deterministic. Vertex is used only for audio generation;
generation and regeneration require a cost ceiling bound to the plan.

```sh
pnpm podcast audio plan ai-and-the-internet
pnpm podcast audio generate ai-and-the-internet --yes --max-cost-usd 5
pnpm podcast audio scene ai-and-the-internet scene-001 approve
pnpm podcast audio scene ai-and-the-internet scene-002 regenerate \
  --yes --max-cost-usd 1
pnpm podcast audio assemble ai-and-the-internet
pnpm podcast audio approve ai-and-the-internet
```

Listen to every scene before approving it and listen to the complete assembly
before the final confirmation. Approved deliverables are
`final/episode.mp3` and `final/audio-manifest.json`.

## Local verification

```sh
pnpm schemas:podcast          # regenerate JSON Schema from TypeBox definitions
pnpm schemas:podcast:check    # fail if checked-in JSON is stale
pnpm typecheck
pnpm test
pnpm podcast doctor ai-and-the-internet
```

The TypeBox definitions under `scripts/podcast/schemas/` are the source of
truth. TypeScript types are inferred from those definitions, while
`schemas/podcast/v1/*.json` is generated for Ajv, `agy` structured output, and
external tooling. Generated JSON files include a warning and should not be
edited directly.

`podcasts/*/.work/` is ignored. The tool never invokes Git. The existing
`pnpm generate-audio` blog narration workflow remains separate and unchanged.
