const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { build } = require("esbuild");

// A local-only page: exercises the real content script against real React Select.
// It uses synthetic profile data, never submits a form, and needs no JobPilot login.
const port = Number(process.env.JOBPILOT_TEST_PORT || 4178);
http.createServer(async (request, response) => {
    try {
        if (request.url === "/fixture.js") {
            const bundle = await build({ entryPoints: [path.join(__dirname, "fixture.jsx")], bundle: true, write: false, platform: "browser", define: { "process.env.NODE_ENV": '"development"' } });
            response.setHeader("Content-Type", "text/javascript");
            response.end(bundle.outputFiles[0].text);
        } else if (request.url === "/content-script.js") {
            response.setHeader("Content-Type", "text/javascript");
            response.end(fs.readFileSync(path.join(__dirname, "../content-script.js")));
        } else {
            response.setHeader("Content-Type", "text/html");
            response.end(`<!doctype html><meta charset="utf-8"><title>JobPilot autocomplete regression tests</title>
              <style>body{font:16px system-ui;margin:32px;background:#f6f8fc;color:#172033}#fixture{max-width:620px;padding:24px;background:white}label{display:block;margin-top:20px}.error-message{color:#b42318}#results{white-space:pre-wrap}button{padding:10px}input{font:inherit}#decoy{position:fixed;right:10px;top:160px}</style>
              <h1>JobPilot autocomplete browser tests</h1><p>Uses React Select 5.10.2 and the installed source content script. All data is synthetic.</p>
              <button id="run">Run regression tests</button><pre id="results">Ready</pre><div id="fixture"></div>
              <script src="/fixture.js"></script><script src="/content-script.js"></script>`);
        }
    } catch (error) { response.statusCode = 500; response.end(error.message); }
}).listen(port, "127.0.0.1", () => console.log(`Browser tests: http://127.0.0.1:${port}`));
