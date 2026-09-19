# JobPilot Chrome Extension

The extension is a Manifest V3 companion for JobPilot. It scans the application in the active Chrome tab, previews Profile-based answers in a native side panel, and fills only after the user clicks a fill button. It never submits an application.

## Local installation

1. Start the JobPilot backend on `http://localhost:3500` and frontend on `http://localhost:3000`.
2. Open `chrome://extensions` in Google Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select this `extension` directory.
5. Pin **JobPilot Autofill** from Chrome's Extensions menu.
6. Sign in to JobPilot, open **Profile**, and generate a Chrome extension pairing code.
7. Open the JobPilot side panel, enter the code, and connect.

After editing extension files, use the reload button on `chrome://extensions` and refresh the application webpage.

## Supported sites

The extension is pre-enabled for Greenhouse, Ashby, Lever, Workday, SmartRecruiters, Jobvite, iCIMS, and Workable. On another application site, click the JobPilot toolbar icon and grant Chrome access for that tab. Because websites change their markup, custom controls may still require manual review.

## Security model

- Pairing codes expire after 10 minutes and work once.
- The extension stores a revocable, 90-day scoped token in `chrome.storage.local`.
- The extension never contains database credentials or `OPENAI_API_KEY`.
- OpenAI is called only after **Use AI for unresolved fields** is clicked.
- AI suggestions require individual review and selection before filling.
- Existing field values are never overwritten.
- Passwords, signatures, certifications, file uploads, and unsupported legal fields are not filled.
- The extension never submits an application.

## Production configuration

1. Host the backend over HTTPS.
2. Enter that HTTPS backend URL in the connection form. Chrome asks for access to that specific origin.
3. Add the production extension ID to the backend environment:

   ```text
   JOBPILOT_EXTENSION_IDS=your_32_character_extension_id
   ```

4. Add the production frontend origin to `FRONTEND_ORIGIN`. Multiple origins can be comma-separated.
5. Zip the contents of this directory—not its parent directory—and submit the package in the Chrome Web Store developer dashboard.

The Chrome Web Store listing will also require screenshots, the 128px icon, a support contact, and a public privacy policy URL. Those account-owned publication steps cannot be performed by the repository itself.

