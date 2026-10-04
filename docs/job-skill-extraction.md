# Job-description skill extraction

Qualifications tags, Profile matching and resume alignment now use one extractor.
The old skill catalog is retained in `skillAliases.js` for spelling equivalences
and fallback recognition, not as the allowed vocabulary. Semantic extraction can
emit unfamiliar tools, architectures, domain knowledge and practices.

## Inputs and grounding

Career-board ingestion retains full description text (up to 40,000 characters),
in addition to the short display summary and requirement bullets. Responsibilities
are included. The model returns compact labels, aliases, required/preferred/mentioned
categories, and exact supporting quotes. Server validation rejects ungrounded
labels. Job text is treated as untrusted data, not executable instructions.
No candidate profile or resume is sent in this extraction request.

The v2 quality gate rejects employer entities, grammatical fragments, illustrative
abbreviations, glued sentence tokens and vague standalone verbs/adjectives. It
cleans list introductions (for example, “particularly indexing” becomes “indexing”).
The same gate applies to model output, cached skills, local extraction and scoring.
Employer context is included in the versioned fingerprint, invalidating older noisy
results without deleting users' saved skills. Ambiguous vendor/database names such
as MongoDB require a technology-use clause when they also name the employer.

This uses the existing OpenAI Responses integration with strict Structured Outputs:
https://developers.openai.com/api/docs/guides/structured-outputs
It does **not** search the web per job or treat model knowledge as proof that a job
requires a skill. Public taxonomies such as ESCO are useful for normalization but
are not an exhaustive allowlist, especially for emerging tools:
https://esco.ec.europa.eu/en/use-esco/use-esco-services-api/esco-web-service-api

## Cache, latency and cost

Run migration `026_job_skill_extractions.sql` with the existing migration command.
`OPENAI_API_KEY` enables semantic extraction; `JOB_SKILL_MODEL` optionally overrides
`OPENAI_MODEL` (existing default: `gpt-5-nano`). Opening a job detail requests extraction
once for its description fingerprint. Resume assessment reuses identical inputs.
Listing/ranking jobs only hydrates existing results and never fans out paid calls.
The fingerprint includes the extractor version. Changed descriptions are re-extracted.
Postgres stores results and token usage, with a cross-process lease and five-minute
failure cooldown. In-process single-flight and a two-request concurrency limit bound
work. The API request has a 45-second timeout and a 10,000-output-token cap. This is
an additional metered AI operation, not a free internet lookup.

No key, provider failure, or pending lease falls back to generic acronyms, product
name patterns, explicit skill clauses and known aliases. The UI labels this a local
estimate. It is less comprehensive than semantic extraction; it is not an ATS score.
Local skills remain profile-independent, so adding a profile skill never expands
the denominator. A broad AI skill cannot count as PyTorch, CNNs, or LLMs.

Existing cached postings with truncated source text retain their available bullets;
normal career-source refresh repopulates the full description. Newly fetched detail
responses calculate tags/scores again; old stored profileMatch fields are not trusted.

Tests use a screenshot-derived fixture, novel names absent from the alias dictionary,
mocked structured API output, cache reuse/invalidation, failures, and score consistency.
