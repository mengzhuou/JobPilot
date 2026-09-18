const repo = require("../repositories/userProfileRepository");

const sections = new Set(["personal", "education", "experience", "skills", "preferences", "equalEmployment"]);
const invalidText = (section, value) => {
    let editable = [];
    if (section === "skills") editable = value;
    else if (["preferences", "equalEmployment"].includes(section)) editable = value.flat();
    else if (["education", "experience"].includes(section)) editable = value.flatMap(item => Object.entries(item).filter(([, field]) => !Array.isArray(field)).map(([, field]) => field));
    else if (section === "personal") editable = Object.entries(value).filter(([key]) => key !== "links").map(([, field]) => field);
    return editable.some(field => typeof field === "string" && field.length > 200);
};

const get = async (req, res, next) => {
    try {
        const profile = await repo.getByUserId(req.auth.userId);
        if (!profile) return res.status(404).json({ message: "Profile has not been created yet" });
        return res.json({ profile });
    } catch (error) { return next(error); }
};

const update = async (req, res, next) => {
    try {
        const { section, value } = req.body;
        if (!sections.has(section)) return res.status(400).json({ message: "Invalid profile section" });
        if (invalidText(section, value)) return res.status(400).json({ message: "Profile fields must be 200 characters or fewer" });
        const profile = await repo.updateSection(req.auth.userId, section, value);
        if (!profile) return res.status(404).json({ message: "Profile has not been created yet" });
        return res.json({ profile });
    } catch (error) { return next(error); }
};

module.exports = { get, update };
