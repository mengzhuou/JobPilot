const crypto = require("crypto");
const dns = require("dns").promises;
const net = require("net");
const { load } = require("cheerio");
const contextRepository = require("../repositories/candidateContextRepository");
const resumeRepository = require("../repositories/resumeRepository");
const { extractResumeText } = require("./resumeTextService");

const MAX_REMOTE_BYTES = 1024 * 1024;
const MAX_PORTFOLIO_TEXT = 12000;
const sha256 = value => crypto.createHash("sha256").update(String(value || "")).digest("hex");
const cleanText = (value, limit) => String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);

const isPrivateAddress = address => {
    if (net.isIPv4(address)) {
        const parts = address.split(".").map(Number);
        return parts[0] === 10
            || parts[0] === 127
            || (parts[0] === 169 && parts[1] === 254)
            || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
            || (parts[0] === 192 && parts[1] === 168)
            || parts[0] === 0;
    }
    if (net.isIPv6(address)) {
        const normalized = address.toLowerCase();
        return normalized === "::1" || normalized === "::" || normalized.startsWith("fc")
            || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9")
            || normalized.startsWith("fea") || normalized.startsWith("feb");
    }
    return true;
};

const assertPublicUrl = async value => {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
        throw new Error("Portfolio URL must be a public HTTP or HTTPS address.");
    }
    if (url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("Portfolio URL is not public.");
    const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(entry => isPrivateAddress(entry.address))) {
        throw new Error("Portfolio URL resolved to a private network address.");
    }
    return url;
};

const readLimitedBody = async response => {
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_REMOTE_BYTES) throw new Error("Portfolio page is too large to index safely.");
    const reader = response.body?.getReader();
    if (!reader) return "";
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_REMOTE_BYTES) {
            await reader.cancel();
            throw new Error("Portfolio page is too large to index safely.");
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString("utf8");
};

const fetchPublicPage = async value => {
    let current = await assertPublicUrl(value);
    for (let redirect = 0; redirect < 4; redirect += 1) {
        const response = await fetch(current, {
            redirect: "manual",
            headers: { "User-Agent": "JobPilot candidate portfolio indexer/1.0" },
            signal: AbortSignal.timeout(8000),
        });
        if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
            current = await assertPublicUrl(new URL(response.headers.get("location"), current).toString());
            continue;
        }
        if (!response.ok) throw new Error(`Portfolio returned HTTP ${response.status}.`);
        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
            throw new Error("Portfolio did not return readable HTML or text.");
        }
        const raw = await readLimitedBody(response);
        if (contentType.includes("text/plain")) return cleanText(raw, MAX_PORTFOLIO_TEXT);
        const $ = load(raw);
        $("script,style,noscript,svg,nav,footer").remove();
        return cleanText($("title").text() + " " + $("main").text() + " " + $("body").text(), MAX_PORTFOLIO_TEXT);
    }
    throw new Error("Portfolio redirected too many times.");
};

const profileLink = (profile, label) => (profile?.personal?.links || []).find(link =>
    String(link?.label || "").toLowerCase().includes(label)
)?.href || "";

const getPortfolioContext = async (userId, profile) => {
    const url = profileLink(profile, "portfolio");
    if (!url || /linkedin\.com/i.test(url)) return null;
    const sourceKey = sha256(url.trim().toLowerCase());
    const cached = await contextRepository.findByKey(userId, "portfolio", sourceKey);
    if (cached) return cached.status === "ready" ? { url: cached.source_url, text: cached.content } : null;
    try {
        const content = await fetchPublicPage(url);
        const saved = await contextRepository.upsert(userId, {
            sourceType: "portfolio",
            sourceKey,
            sourceUrl: url,
            content,
            contentHash: sha256(content),
            status: content ? "ready" : "unavailable",
            errorMessage: content ? "" : "No readable portfolio text was found.",
        });
        return saved.status === "ready" ? { url: saved.source_url, text: saved.content } : null;
    } catch (error) {
        await contextRepository.upsert(userId, {
            sourceType: "portfolio",
            sourceKey,
            sourceUrl: url,
            status: "unavailable",
            errorMessage: String(error.message || "Portfolio could not be indexed.").slice(0, 500),
        });
        return null;
    }
};

const getResumeContext = async (userId, resume) => {
    if (!resume) return null;
    if (resume.extracted_at) return {
        name: resume.display_name,
        targetJobTitle: resume.target_job_title,
        text: String(resume.extracted_text || "").slice(0, 20000),
    };
    try {
        const text = await extractResumeText({ fileData: resume.file_data, mimeType: resume.mime_type });
        await resumeRepository.saveExtractedText(userId, resume.id, { text });
        return { name: resume.display_name, targetJobTitle: resume.target_job_title, text: text.slice(0, 20000) };
    } catch (error) {
        await resumeRepository.saveExtractedText(userId, resume.id, { error: String(error.message || "Résumé text could not be extracted.").slice(0, 500) });
        return { name: resume.display_name, targetJobTitle: resume.target_job_title, text: "" };
    }
};

const getCandidateContext = async ({ userId, profile, resume }) => ({
    resume: await getResumeContext(userId, resume),
    portfolio: await getPortfolioContext(userId, profile),
    linkedInHistory: {
        url: profileLink(profile, "linkedin"),
        note: "LinkedIn is not scraped. Work history below comes from the candidate's editable JobPilot Profile.",
        experience: (profile?.experience || []).slice(0, 10).map(item => ({
            company: String(item.company || "").slice(0, 200),
            title: String(item.title || "").slice(0, 200),
            location: String(item.location || "").slice(0, 200),
            from: String(item.from || "").slice(0, 40),
            to: String(item.to || "").slice(0, 40),
            summary: String(item.summary || "").slice(0, 500),
            bullets: (item.bullets || []).slice(0, 6).map(bullet => String(bullet).slice(0, 500)),
        })),
    },
});

module.exports = {
    getCandidateContext,
    getPortfolioContext,
    getResumeContext,
    fetchPublicPage,
    isPrivateAddress,
};
