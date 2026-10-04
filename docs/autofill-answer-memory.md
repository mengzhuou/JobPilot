# Autofill answer memory

Extension 0.2.19 improves normal Autofill without making an AI request.

## User flow

- Open a supported application with JobPilot connected. **Remember answers I enter** is visible in the panel and enabled by default.
- Fill from Profile as usual. For a new question, choose an answer on the employer's form. Committed manual changes are batched after a short debounce; typing in text fields is not saved until change/blur.
- Manual corrections replace the previous learned answer for that exact question. Existing answers on the current page are never overwritten by Autofill. Profile itself is unchanged.
- Saved personal answers can be reused across employers. Context-dependent answers belong to the application URL, including its job identifier. Matching is conservative: question normalization preserves negation, qualifiers, and numbers, and available options must agree.
- Pause remembering with the checkbox. **Manage learned answers → Forget learned answers** deletes all manually learned answers for the signed-in account and pauses capture. This does not remove Profile values or the separate, previously existing AI story memory.

## Privacy and correctness

- Unknown answers do **not** default to No. Clearance level, polygraph type, clearance issuer, and active clearance are separate facts. Protected-veteran status does not establish whether someone has ever served or currently serves.
- Gender, transgender experience, race/ethnic background, Hispanic/Latino identification, orientation, and disability use their distinct saved Profile fields. Demo/seed application answers are not user facts.
- Capture is armed only after an application scan. Trusted user events are required; programmatic Autofill is suppressed. Frames/documents and the connected account are checked again in the service worker. No answer is captured from an unscanned control.
- Passwords, government identifiers, banking fields, file contents, signatures, and consent/attestation controls are excluded from manual answer memory. CAPTCHA remains manual.
- Manual memories live in `confirmed_autofill_answers`, scoped to the authenticated user; they are not retrieved for AI prompts. Do not log their values. Database access/backups must use the same protections as private Profile data.
- Native dropdowns, radio/checkbox groups, text areas, React Select, and multi-selects are supported. Custom/inaccessible controls, changed choices, or unverified selections remain review items rather than falsely reporting success. This is not a promise to support every site's custom widget.
- Memory errors do not block Profile Autofill. The panel reports when memory is unavailable. In-flight memory writes are drained before a forget operation.

## Deployment and verification

Run backend migrations (adds `025_confirmed_autofill_answers.sql`) and restart the backend. Reload the unpacked extension in Chrome and refresh any already-open application tabs.

Automated checks:

```
node --test backend/services/confirmedAnswerPolicy.test.js backend/repositories/confirmedAutofillAnswerRepository.test.js backend/services/extensionAutofillPlanner.test.js backend/services/autofillProfileMapper.test.js extension/tests/*.test.cjs
npm run test:autofill
npm run extension:check
```

For real React Select regression checks, run `npm run extension:test:serve`, open the printed local URL, and choose **Run regression tests**. **Start manual memory test** uses only synthetic in-page data to verify trusted input capture and corrections. It makes no external requests or real application submissions.
