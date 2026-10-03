# Résumé enhancement

## Candidate flow

1. Open a job through JobPilot’s **Autofill** page. The extension’s **Fill** action applies reviewed fields directly, without an enhancement assessment or a second confirmation.
2. JobPilot compares readable résumé text with detected job skills. Below 75% keyword alignment, it offers enhancement if there are gaps and reminders have not been dismissed. No model call is made for this assessment.
3. Choose Summary, Skills and/or Experience, plus quick (first two roles) or full experience coverage. Provide factual context for skills not already in the résumé, and explicitly consent to sending the résumé and job context to OpenAI.
4. Review the styled resume preview and highlighted changes. Switch to **Edit manually**, or give instructions to **Edit with AI** / **Regenerate**. AI actions require clearly marked permission and consume the existing daily attempt budget. Each revision creates an account-owned draft, preserving the previous version; saved versions get an editable copy. Restore the previous version within the current editor session, or reopen earlier drafts from history. Confirm accuracy before downloading a DOCX or saving a separate job-selected version. Original files, the primary resume and Profile are not changed.
5. Return to the application and click Fill. The extension downloads the latest saved job-specific résumé at fill time, falling back to the primary when there is no selection. Enhancement availability cannot block this action. If a file has already been attached, remove it on the application before filling again.

Drafts can be reopened from **Résumés → Job-tailored résumés**. The reminder toggle there reverses “Don’t remind me again.” A job-specific selection can be cleared on its Autofill page. Export remains available when the five saved résumé slots are full.

## Deployment

- Install backend dependencies (`npm ci` in `backend`); DOCX export uses `docx`.
- Run `npm run db:migrate` in `backend`, or restart the backend (startup runs migrations). Migrations 023 and 024 add account-owned drafts, reminder preferences, job selections and generation attempts.
- Configure the existing server-side `OPENAI_API_KEY` and `OPENAI_MODEL` (default remains `gpt-5-nano`). These never enter extension storage or browser code.
- Rebuild/restart the frontend, reload extension **0.2.17**, and refresh application tabs.
- For production, the extension’s existing app-bridge match list must contain the deployed frontend origin. Enhancement reuses that trusted origin when opening its editor.

## Safety and behavior

- The score is a deterministic keyword-coverage estimate, not an employer ATS score, hiring prediction or the existing Profile match score. At least three recognized skills and 100 characters of job context are required for a number. The skill catalogue is technology-focused; unfamiliar roles can have no reliable score.
- Readability checks inspect extracted text, not original PDF layout. Scanned/image-only PDFs and legacy DOC files may be unreadable. Résumés reaching the 30,000-character extraction limit are not enhanced, to avoid silently omitting content. Export uses a new single-column text-based DOCX layout, not the original formatting. The employer must accept DOCX uploads.
- The model returns inclusive source-line IDs and replacement text using strict structured output. The server reconstructs exact original text and character offsets; the model never has to reproduce PDF whitespace or Unicode. Offsets distinguish repeated lines. Invalid or overlapping ranges are rejected. New unsupported numbers and detected/selected job skills are rejected. This is defense in depth, not a factual-proof system: candidate review is still required.
- Normal generation awaits one POST without concurrent status polling. Reopening an in-progress draft or recovering a lost connection uses sequential status GETs after 5, 10, then 15 seconds between checks; these never call OpenAI. A synchronous client guard and the existing database lock prevent duplicate generation.
- Résumé/job text is treated as untrusted data. OpenAI requests use `store: false`, a 90-second timeout, bounded input/output and explicit user consent. Normal Autofill does not invoke OpenAI.
- Five generation attempts per user per UTC day, including failed/interrupted attempts; HTTP rate limiting also applies. A database account lock prevents concurrent requests from overspending that budget. Ready/saved draft retries return the existing result without generating or saving a duplicate.
- Generation status, suggestions, model/token usage and review text are persisted by account. Generation can finish after the editor closes. After an interruption lasting over two minutes, the user can retry. A process restart does not silently charge another generation.
- Job-specific selections use the application URL, with only known tracking parameters removed. Other URLs (including redirects to a different application URL) intentionally do not inherit a résumé selection. In that case, enhance from the extension on the final application page, or attach the downloaded DOCX manually.
- No application submission, fabricated qualification, automatic primary-résumé replacement or automatic Profile mutation is part of this feature.

## Verification

```sh
cd backend
node --test services/resumeEnhancementService.test.js controllers/resumeEnhancementController.test.js repositories/resumeEnhancementRepository.test.js
# Optional real PostgreSQL round-trip; creates only synthetic records in a transaction and rolls them back.
RUN_ENHANCEMENT_DB_TEST=1 node --test repositories/resumeEnhancement.integration.test.js
cd ../frontend
CI=true npm test -- --watchAll=false --watchman=false --runInBand
npm run build
cd ..
node --test extension/tests/*.test.cjs
```

`node extension/tests/resume-enhancement-preview.cjs` serves an isolated synthetic UI at `http://127.0.0.1:4193`. It makes no account writes or provider requests. Automated generation tests mock OpenAI; live provider quality and employer-specific upload acceptance still need a deliberate smoke test.
