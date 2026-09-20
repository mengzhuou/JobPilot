const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

assert.equal(manifest.manifest_version, 3, "The extension must use Manifest V3.");
assert.equal(manifest.background?.service_worker, "service-worker.js");
assert.equal(manifest.side_panel?.default_path, "sidepanel.html");
assert(manifest.permissions.includes("sidePanel"));

const requiredFiles = [
    manifest.background.service_worker,
    manifest.side_panel.default_path,
    "content-script.js",
    "sidepanel.js",
    "sidepanel.css",
    "application-lifecycle.js",
    ...manifest.content_scripts.flatMap(script => script.js),
    ...Object.values(manifest.icons || {}),
];

for (const relativePath of new Set(requiredFiles)) {
    assert(fs.existsSync(path.join(root, relativePath)), `Missing extension asset: ${relativePath}`);
}

for (const relativePath of [...new Set(requiredFiles.filter(file => file.endsWith(".js")))]) {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert(!/<script[^>]+src=["']https?:/i.test(source), `${relativePath} references remotely hosted code.`);
    assert(!/OPENAI_API_KEY|DATABASE_URL|SESSION_SECRET/.test(source), `${relativePath} contains a server-side secret name.`);
}

console.log(`JobPilot extension ${manifest.version} passed package validation (${requiredFiles.length} assets checked).`);
