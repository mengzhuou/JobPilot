const repo = require("../repositories/userProfileRepository");

const sections = new Set(["personal", "education", "experience", "skills", "preferences", "equalEmployment"]);
const invalidText = (section, value) => {
    let editable = [];
    if (section === "skills") editable = value;
    else if (["preferences", "equalEmployment"].includes(section)) editable = value.flat(2);
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
        const object = item => item && typeof item === 'object' && !Array.isArray(item);
        const present = text => typeof text === 'string' && text.trim().length > 0;
        let valid = section === 'personal' ? object(value) : Array.isArray(value);
        if (valid && section === 'personal') valid = ['firstName','lastName','email','phone','addressLine','country','state','city','postalCode'].every(key => present(value[key]));
        if (valid && ['education','experience'].includes(section)) {
            const required = section === 'education' ? ['school','degree'] : ['title','company'];
            valid = value.every(item => object(item) && required.every(key => present(item[key])));
        }
        if (valid && section === 'skills') valid = value.every(present);
        if (valid && ['preferences','equalEmployment'].includes(section)) valid = value.every(row =>
            Array.isArray(row) && row.length === 2 && present(row[0]) &&
            (typeof row[1] === 'string' || (section === 'preferences' && Array.isArray(row[1]) && row[1].every(present))));
        if (!valid) return res.status(400).json({ message: 'Please complete all required fields with valid values.' });
        if (section === 'education' && value.some(item => item.gpa !== undefined && item.gpa !== '' &&
            !/^[0-9]+([.][0-9]+)?$/.test(String(item.gpa)))) {
            return res.status(400).json({ message: 'GPA must be a non-negative number or left blank.' });
        }
        if (invalidText(section, value)) return res.status(400).json({ message: "Profile fields must be 200 characters or fewer" });
        const profile = await repo.updateSection(req.auth.userId, section, value);
        if (!profile) return res.status(404).json({ message: "Profile has not been created yet" });
        return res.json({ profile });
    } catch (error) { return next(error); }
};

module.exports = { get, update };
