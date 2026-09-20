const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");

const MAX_RESUME_TEXT = 30000;
const cleanText = value => String(value || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_RESUME_TEXT);

const extractResumeText = async ({ fileData, mimeType }) => {
    if (!fileData?.length) return "";
    if (mimeType === "application/pdf") {
        const parser = new PDFParse({ data: new Uint8Array(fileData) });
        try {
            const result = await parser.getText();
            return cleanText(result.text);
        } finally {
            await parser.destroy().catch(() => {});
        }
    }
    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const result = await mammoth.extractRawText({ buffer: Buffer.from(fileData) });
        return cleanText(result.value);
    }
    throw Object.assign(new Error("Text extraction is not available for legacy .doc résumés. Upload PDF or DOCX for AI context."), { code: "UNSUPPORTED_RESUME_TEXT" });
};

module.exports = { extractResumeText, cleanResumeText: cleanText, MAX_RESUME_TEXT };
