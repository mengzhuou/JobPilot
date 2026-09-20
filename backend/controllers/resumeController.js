const path = require("path");
const repository = require("../repositories/resumeRepository");
const { extractResumeText } = require("../services/resumeTextService");

const allowedExtensions = new Set([".pdf", ".doc", ".docx"]);
const allowedMimeTypes = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const cleanText = value => typeof value === "string" ? value.trim() : "";
const displayNameFromFile = name => path.basename(name, path.extname(name));

const assertResumeText = ({ displayName, targetJobTitle }) => {
    if (!displayName || displayName.length > 199 || targetJobTitle.length > 199) {
        throw Object.assign(new Error("Resume name and target job title must be 199 characters or fewer."), { statusCode: 400 });
    }
};

const list = async (req, res, next) => {
    try { return res.json({ resumes: await repository.listByUserId(req.auth.userId) }); }
    catch (error) { return next(error); }
};

const create = async (req, res, next) => {
    try {
        const file = req.file;
        const extension = file && path.extname(file.originalname).toLowerCase();
        if (!file || !allowedExtensions.has(extension) || !allowedMimeTypes.has(file.mimetype)) {
            return res.status(400).json({ message: "Upload a PDF, DOC, or DOCX resume." });
        }
        const displayName = cleanText(req.body.displayName) || displayNameFromFile(file.originalname);
        const targetJobTitle = cleanText(req.body.targetJobTitle);
        assertResumeText({ displayName, targetJobTitle });
        let extractedText = "";
        let extractionError = "";
        try {
            extractedText = await extractResumeText({ fileData: file.buffer, mimeType: file.mimetype });
        } catch (error) {
            extractionError = String(error.message || "Résumé text could not be extracted.").slice(0, 500);
        }
        const resume = await repository.create(req.auth.userId, {
            fileName: path.basename(file.originalname), displayName, targetJobTitle,
            mimeType: file.mimetype, fileSize: file.size, fileData: file.buffer,
            extractedText, extractedAt: new Date(), extractionError,
        });
        return res.status(201).json({ resume });
    } catch (error) { return next(error); }
};

const update = async (req, res, next) => {
    try {
        const displayName = cleanText(req.body.displayName);
        const targetJobTitle = cleanText(req.body.targetJobTitle);
        assertResumeText({ displayName, targetJobTitle });
        const resume = await repository.update(req.auth.userId, req.params.id, { displayName, targetJobTitle });
        if (!resume) return res.status(404).json({ message: "Resume not found." });
        return res.json({ resume });
    } catch (error) { return next(error); }
};

const makePrimary = async (req, res, next) => {
    try {
        const resume = await repository.setPrimary(req.auth.userId, req.params.id);
        if (!resume) return res.status(404).json({ message: "Resume not found." });
        return res.json({ resume });
    } catch (error) { return next(error); }
};

const download = async (req, res, next) => {
    try {
        const resume = await repository.findFile(req.auth.userId, req.params.id);
        if (!resume) return res.status(404).json({ message: "Resume not found." });
        const safeName = resume.file_name.replace(/[\\/\r\n"]/g, "_");
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
        res.type(resume.mime_type);
        return res.send(resume.file_data);
    } catch (error) { return next(error); }
};

const remove = async (req, res, next) => {
    try {
        if (!await repository.remove(req.auth.userId, req.params.id)) return res.status(404).json({ message: "Resume not found." });
        return res.status(204).send();
    } catch (error) { return next(error); }
};

module.exports = { list, create, update, makePrimary, download, remove };
