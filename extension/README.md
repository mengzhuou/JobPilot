# JobPilot Chrome Extension

The extension is a Manifest V3 companion for JobPilot. It scans the application in the active Chrome tab, previews Profile-based answers in a native side panel, and fills only after the user clicks a fill button. Submission requires a separate explicit click on **Submit application**.

Autofill also attaches the user's primary JobPilot résumé to a detected résumé/CV file field, types into autocomplete controls and selects the closest equivalent option, then rescans the application so the side panel reflects the updated form.

Rescans inspect native validity, `aria-invalid`, associated error messages, and visible field errors. A field with a displayed value is still treated as unresolved when the application reports that value as invalid.

Version 0.2.1 maps full degree titles to qualification-level dropdown options (for example, Bachelor of Science in Computer Science → Bachelor's Degree). It selects the option and verifies it survives blur; it does not infer another major or professional qualification. Restart the backend and reload the extension plus job tab to use the updated mapping.

Greenhouse's React Select dropdowns open with a full mouse sequence. Autofill follows the active field's menu ID, selects an equivalent option, moves focus away, and checks that a selected value persists. Search text alone is not a selection. City matching includes the Profile's state and country; ambiguous matches stay unresolved. Selected controls are still scanned when React Select empties or hides its search input.

## Local installation

Version 0.2.8 initializes each iframe independently, reports frames that cannot be accessed, and excludes CAPTCHA frames. Cross-origin frames still require Chrome site access; the extension does not bypass it. Ashby nested education labels/required flags, date placeholders, saved education dates, and same-name radios in separate forms are covered by regressions. The supplied D. E. Shaw job 5375 URL redirected to `application-error.html?errorCode=INVALID_LINK` during testing; its live form could not be verified. Run `node --test extension/tests/frames.test.cjs` for the frame routing tests.

Version 0.2.6 adds Ashby question-container labels, button-based Yes/No answers, visually hidden radio/checkbox controls, and plain Location mapping. The extra résumé parsing upload is excluded in favor of the actual résumé field. AI writing-style settings are visible only for Loop launches, not regular Autofill. Restart the backend, reload the extension, and refresh application tabs after updating.

Version 0.2.5 separates regular Autofill from Loop. Regular Autofill hides Submit and Generate AI suggestions and never automatically confirms or closes after submission. The user still answers the existing confirmation dialog manually. Those actions are reserved for launches originating from `/loops`; the current Loop page remains a setup preview, with no execution runner wired yet. The panel's AI writing-style setting is stored locally in this Chrome profile and sent as style-only guidance during future Loop AI generation/revision, not stored as candidate facts. Saving a style makes no AI request. Restart backend/frontend, reload the extension and refresh existing tabs to apply this behavior.

Version 0.2.4 scans same-name checkbox choices under one shared question as a single answer. A selected choice satisfies the group's required state; unchecked alternatives no longer produce individual native missing-value errors. Visible site errors and independently required acknowledgements remain blocking.

Version 0.2.3 limits AI suggestions to unresolved text/textarea fields without dropdown options. Standard Autofill does not call OpenAI. Empty optional fields do not block Submit; invalid entered values still require correction. When no Profile fields remain, Submit replaces the disabled Fill action. Check the version shown beneath the JobPilot heading after reloading the extension.

1. Start the JobPilot backend on `http://localhost:3500` and frontend on `http://localhost:3000`.
2. Open `chrome://extensions` in Google Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select this `extension` directory.
5. Pin **JobPilot Autofill** from Chrome's Extensions menu.
6. Sign in to JobPilot, open **Profile**, and generate a Chrome extension pairing code.
7. Open the JobPilot side panel, enter the code, and connect.

After editing extension files, use the reload button on `chrome://extensions` and refresh the application webpage.

Version 0.2.0 requires restarting the backend/frontend, reloading the extension, and refreshing both JobPilot and any existing job tabs. Playwright browser autofill and its endpoints have been removed.

## Launch and submission flow

Click **Open with extension** on JobPilot's Autofill page. The extension opens the job, opens its side panel, and automatically rescans, including when the application form loads later. The Autofill page always presents the submission confirmation dialog.

After a submit attempt followed by an explicit success confirmation, the extension closes the job tab and returns to Autofill. JobPilot automatically confirms Yes, saves the application, then closes the Autofill tab. A save failure keeps the dialog open for retry. Closing a job tab without success does not mark it applied; the user answers the dialog. Sites without a recognizable success confirmation require that manual answer.

Version 0.2.2 adds **Submit application**. A post-autofill rescan enables it only when required fields are complete, no scanned errors remain, and one recognizable submit control is available. Optional fields may be blank. Clicking Submit rechecks the active tab and form, then invokes the site's submit handler. Launch through **Open with extension** to enable application tracking. CAPTCHAs, unsupported controls, and site errors require manual attention; submissions are never automatically retried.

Run `npm run extension:test:lifecycle` from the repository root for mocked Chrome lifecycle tests. Run the frontend `useExtensionApplication.test.js` suite for confirmation and save-failure tests. An installed-Chrome smoke test is still needed for each site's success screen.

## Browser regression checks

From the repository root, run `npm ci --prefix extension/tests`, then `npm run extension:test:serve`. Open `http://127.0.0.1:4178` in Chrome and click **Run regression tests**.

The fixture runs the source content script through its scan/apply messages against React Select 5.10.2, including Greenhouse's controlled menu behavior (`menuIsOpen`, control `mouseup`, real blur). It checks committed country/city/sponsorship values, delayed city details, portaled menus, Yes/No ↔ True/False, rescan and skip behavior, ambiguous/rejected options, adjacent validation errors, and no form submission. The fixture uses synthetic data and mocks extension messaging; it does not replace testing the installed extension on a target application. Test dependencies are separate from extension runtime assets and should not be included in the release ZIP.

## Supported sites

The extension is pre-enabled for Greenhouse, Ashby, Lever, Workday, SmartRecruiters, Jobvite, iCIMS, and Workable. On another application site, click the JobPilot toolbar icon and grant Chrome access for that tab. Because websites change their markup, custom controls may still require manual review.

## Security model

- Pairing codes expire after 10 minutes and work once.
- The extension stores a revocable, 90-day scoped token in `chrome.storage.local`.
- The extension never contains database credentials or `OPENAI_API_KEY`.
- OpenAI is called only after **Generate AI suggestions** or a per-answer **Ask AI to improve** button is clicked.
- Generated answers open in a dedicated review view. The user can edit them, request a revised answer, or jump to the matching application field before clicking **Apply AI suggestions**.
- AI drafts use the editable Profile, cached résumé text, cached public portfolio text, and relevant answers the user previously reviewed. LinkedIn is not scraped; work history comes from the Profile.
- A résumé is extracted once per uploaded file, and a public portfolio is fetched once per saved URL. Reviewed answers and factual story context are saved for similar future questions.
- Existing field values are never overwritten.
- Passwords, signatures, certifications, file uploads, and unsupported legal fields are not filled.
- Only the explicit Submit application action submits; autofill and AI actions never submit.

## Production configuration

1. Host the backend over HTTPS.
2. Enter that HTTPS backend URL in the connection form. Chrome asks for access to that specific origin.
3. Add the production extension ID to the backend environment:

   ```text
   JOBPILOT_EXTENSION_IDS=your_32_character_extension_id
   ```

4. Add the production frontend origin to `FRONTEND_ORIGIN`. Multiple origins can be comma-separated. Also add its exact origin to the manifest's `host_permissions` and the `app-bridge.js` content script's `matches`. The launch bridge only trusts these configured JobPilot origins; do not use a wildcard for it.
5. Package only runtime assets (manifest, runtime JavaScript, sidepanel HTML/CSS, and icons), excluding tests and node_modules, and submit the package in the Chrome Web Store developer dashboard.

The Chrome Web Store listing will also require screenshots, the 128px icon, a support contact, and a public privacy policy URL. Those account-owned publication steps cannot be performed by the repository itself.
