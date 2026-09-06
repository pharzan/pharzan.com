import { cp, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { PassId, PASS_ORDER, PodcastError, Review } from "./domain.ts";
import { atomicWrite, exists, sha256, withEpisodeLock, writeYaml } from "./io.ts";
import { editingPlan, runEditing, runResearch } from "./providers.ts";
import { parseScript, placeholders, validateFinalScript } from "./script.ts";
import { appendEvent, approvePriorPass, approvedInputFor, EpisodeContext, latestAttempt, latestCandidate, writeEpisodeConfig } from "./workspace.ts";

export type PassOptions = {
  dryRun: boolean;
  yes: boolean;
  rerun: boolean;
  research: boolean;
  maxEditingInvocations: number;
  maxResearchInvocations: number;
  confirm: (message: string) => Promise<boolean>;
  showPlan?: (plan: Record<string, unknown>) => void;
  editingRunner?: typeof runEditing;
  researchRunner?: typeof runResearch;
};

function renderReview(review: Review): string {
  const blockers = review.validations.filter((item) => item.severity === "blocking" && !item.pass);
  return `# ${review.pass} review (attempt ${review.attempt})\n\n${review.summary}\n\n` +
    `- Source coverage: ${review.source_coverage.length}\n- Changes: ${review.changes.length}\n- Open placeholders: ${review.placeholders.filter((item) => item.status === "open").length}\n- Claims: ${review.claims.length}\n- Pending proposals: ${review.proposals.filter((item) => item.status === "pending").length}\n- Blocking validations: ${blockers.length}\n\n` +
    [...blockers, ...review.validations.filter((item) => item.severity === "warning")].map((item) => `- **${item.code}**: ${item.message}`).join("\n") + "\n";
}

async function currentReview(context: EpisodeContext): Promise<Review | undefined> {
  const candidate = await latestCandidate(context);
  if (!candidate) return undefined;
  const filename = path.join(path.dirname(candidate.path), "review.yaml");
  return await exists(filename) ? YAML.parse(await readFile(filename, "utf8")) as Review : undefined;
}

function validatePassTransition(pass: PassId, input: string, output: string, review: Review, sourceMap: { blocks: Array<{ id: string }> }): void {
  const parsed = parseScript(output);
  if (pass === "structure") {
    const covered = new Set(review.source_coverage.map((item) => item.source_id));
    const missing = sourceMap.blocks.map((block) => block.id).filter((id) => !covered.has(id));
    if (missing.length) throw new PodcastError(`Structure review did not account for source blocks: ${missing.join(", ")}`, "INTEGRITY");
  }
  if (pass === "performance") {
    const before = parseScript(input).turns.map(({ id, role, intent, section }) => ({ id, role, intent, section }));
    const after = parsed.turns.map(({ id, role, intent, section }) => ({ id, role, intent, section }));
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new PodcastError("Performance pass changed turn IDs, roles, intents, boundaries, or section order.", "INTEGRITY");
  }
}

export async function runPass(context: EpisodeContext, pass: PassId, options: PassOptions): Promise<Record<string, unknown>> {
  const operation = async (): Promise<Record<string, unknown>> => {
    const index = PASS_ORDER.indexOf(pass);
    if (index < 0) throw new PodcastError(`Unknown pass: ${pass}`);
    if (index > 0) {
      const previous = PASS_ORDER[index - 1]!;
      const attempt = await latestAttempt(context, previous);
      if (!attempt) throw new PodcastError(`${previous} pass is required first.`, "BLOCKED");
      const approvedDir = path.join(context.work, "passes", previous, `attempt-${String(attempt).padStart(3, "0")}`, "approved");
      if (!await exists(approvedDir)) {
        if (options.dryRun) return { dry_run: true, action: "would_approve_prior_then_generate", prior_pass: previous, pass };
        const priorReview = YAML.parse(await readFile(path.join(path.dirname(approvedDir), "review.yaml"), "utf8")) as Review;
        const unresolved = priorReview.validations.filter((item) => item.severity === "blocking" && !item.pass).length +
          priorReview.changes.filter((item) => item.disposition_required).length +
          (previous === "content" ? priorReview.placeholders.filter((item) => item.status === "open").length + priorReview.proposals.filter((item) => item.status === "pending").length + priorReview.claims.filter((item) => item.material && ["contradicted", "conflicting_sources", "not_found", "not_researched", "author_unconfirmed"].includes(item.status)).length : 0);
        if (unresolved) throw new PodcastError(`${previous} review has ${unresolved} unresolved blocking item(s); update answers.yaml and rerun that pass.`, "BLOCKED");
        const accepted = options.yes || await options.confirm(`Approve the current ${previous} candidate and start ${pass}?`);
        if (!accepted) throw new PodcastError(`${previous} candidate remains pending review.`, "BLOCKED");
        await approvePriorPass(context, pass);
      }
    }
    const input = await approvedInputFor(context, pass);
    const plan = editingPlan(context, pass, input.markdown, options.maxEditingInvocations);
    if (options.dryRun) return { dry_run: true, action: "would_generate_pass", plan };
    options.showPlan?.(plan);
    const existingAttempt = await latestAttempt(context, pass);
    const existingCandidate = existingAttempt ? path.join(context.work, "passes", pass, `attempt-${String(existingAttempt).padStart(3, "0")}`, "candidate.md") : "";
    if (existingAttempt && await exists(existingCandidate) && !options.rerun) throw new PodcastError(`${pass} already has a candidate; use --rerun after reviewing it.`, "BLOCKED");
    if (!Number.isInteger(options.maxEditingInvocations) || options.maxEditingInvocations < 1 || options.maxEditingInvocations > 3) throw new PodcastError("Editing requires --max-editing-invocations 1..3.", "BLOCKED");
    const accepted = options.yes || await options.confirm(`Run ${pass} editing through agy, with at most ${options.maxEditingInvocations} invocation(s)?`);
    if (!accepted) throw new PodcastError(`${pass} provider call was not approved.`, "BLOCKED");
    const attempt = existingAttempt + 1;
    const directory = path.join(context.work, "passes", pass, `attempt-${String(attempt).padStart(3, "0")}`);
    await mkdir(directory, { recursive: true });
    const sourceMapText = await readFile(path.join(context.work, "source-map.json"), "utf8");
    const sourceMap = JSON.parse(sourceMapText) as { blocks: Array<{ id: string }> };
    const answersPath = path.join(context.work, "answers.yaml");
    const answers = await exists(answersPath) ? await readFile(answersPath, "utf8") : "schema_version: 1\n";
    let evidence = "";
    if (pass === "content" && options.research) {
      const priorReview = await currentReview(context);
      const claims = priorReview?.claims ?? [];
      const eligible = claims.filter((claim) => claim.material && claim.classification === "external_fact");
      if (!eligible.length) throw new PodcastError("No material external claims are available to research. Run the content inventory first.", "BLOCKED");
      if (options.maxResearchInvocations < 1) throw new PodcastError("Research requires --max-research-invocations 1..3.", "BLOCKED");
      options.showPlan?.({ schema_version: 1, provider: "agy", claims: eligible.map(({ id, text, turn_ids }) => ({ id, text, turn_ids })), maximum_invocations: Math.min(3, options.maxResearchInvocations), draft_sha256: sha256(input.markdown) });
      const researchAccepted = options.yes || await options.confirm(`Send ${eligible.length} claim(s) and the episode draft to agy, with at most ${Math.min(3, options.maxResearchInvocations)} invocation(s)?`);
      if (!researchAccepted) throw new PodcastError("Research invocation was not approved.", "BLOCKED");
      const researchPlan = { schema_version: 1, provider: "agy", claim_ids: eligible.map((claim) => claim.id), claims_sha256: sha256(JSON.stringify(eligible)), draft_sha256: sha256(input.markdown), maximum_invocations: Math.min(3, options.maxResearchInvocations), approved_at: new Date().toISOString() };
      await atomicWrite(path.join(directory, "research-plan.json"), `${JSON.stringify({ ...researchPlan, plan_sha256: sha256(JSON.stringify(researchPlan)) }, null, 2)}\n`);
      const result = await (options.researchRunner ?? runResearch)(context, claims, input.markdown, directory, options.maxResearchInvocations);
      evidence = JSON.stringify(result, null, 2);
      await atomicWrite(path.join(directory, "evidence.json"), `${evidence}\n`);
    }
    const generated = await (options.editingRunner ?? runEditing)(context, pass, input.markdown, sourceMapText, answers, evidence, directory, options.maxEditingInvocations);
    const review: Review = { schema_version: 1, episode: context.config.slug, pass, attempt, ...generated.response.review };
    await atomicWrite(path.join(directory, "prompt.txt"), generated.prompt);
    await atomicWrite(path.join(directory, "generated.md"), generated.response.candidate_markdown);
    await writeYaml(path.join(directory, "review.yaml"), review);
    await atomicWrite(path.join(directory, "review.md"), renderReview(review));
    await atomicWrite(path.join(directory, "provider.json"), `${JSON.stringify(generated.metadata, null, 2)}\n`);
    try {
      validatePassTransition(pass, input.markdown, generated.response.candidate_markdown, review, sourceMap);
    } catch (error) {
      await atomicWrite(path.join(directory, "validation-error.json"), `${JSON.stringify({ schema_version: 1, at: new Date().toISOString(), error: (error as Error).message, generated_sha256: sha256(generated.response.candidate_markdown) }, null, 2)}\n`);
      throw error;
    }
    await atomicWrite(path.join(directory, "candidate.md"), generated.response.candidate_markdown);
    await appendEvent(context, { action: "pass_generated", pass, attempt, input_sha256: sha256(input.markdown), output_sha256: sha256(generated.response.candidate_markdown), details: { candidate_path: path.relative(context.root, path.join(directory, "candidate.md")), review_path: path.relative(context.root, path.join(directory, "review.md")), plan } });
    return { pass, attempt, candidate: path.join(directory, "candidate.md"), review: path.join(directory, "review.md"), stopped_for_approval: true };
  };
  return options.dryRun ? await operation() : await withEpisodeLock(context.root, `pass ${pass}`, operation);
}

export async function approveScript(context: EpisodeContext, dryRun: boolean): Promise<Record<string, unknown>> {
  const operation = async (): Promise<Record<string, unknown>> => {
    const candidate = await latestCandidate(context);
    if (!candidate || candidate.pass !== "performance") throw new PodcastError("A performance candidate is required.", "BLOCKED");
    validateFinalScript(candidate.markdown);
    const review = YAML.parse(await readFile(path.join(path.dirname(candidate.path), "review.yaml"), "utf8")) as Review;
    const blocking = review.validations.filter((item) => item.severity === "blocking" && !item.pass);
    const pending = review.proposals.filter((item) => item.status === "pending");
    if (blocking.length || pending.length) throw new PodcastError(`Final review has ${blocking.length} blocker(s) and ${pending.length} pending proposal(s).`, "BLOCKED");
    const digest = sha256(candidate.markdown);
    if (dryRun) return { dry_run: true, script_sha256: digest, destination: path.join(context.root, "final", "script.md") };
    await atomicWrite(path.join(context.root, "final", "script.md"), candidate.markdown);
    await atomicWrite(path.join(context.root, "final", "review.md"), await readFile(path.join(path.dirname(candidate.path), "review.md"), "utf8"));
    const manifest = { schema_version: 1, episode: context.config.slug, script_sha256: digest, source_sha256: context.config.source_sha256, template: context.config.template, locale: context.config.locale, approved_at: new Date().toISOString(), pass_attempt: candidate.attempt, review_sha256: sha256(await readFile(path.join(path.dirname(candidate.path), "review.yaml"))) };
    await atomicWrite(path.join(context.root, "final", "script-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    context.config.approved_script_sha256 = digest; await writeEpisodeConfig(context);
    await appendEvent(context, { action: "script_approved", input_sha256: digest, output_sha256: digest });
    return manifest;
  };
  return dryRun ? await operation() : await withEpisodeLock(context.root, "approve-script", operation);
}
