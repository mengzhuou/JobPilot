const normalizeText = text => {
    if (text === null || text === undefined) {
        return "";
    }

    return String(text)
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
};


const getAvailableFormOption = (
    field,
    candidates = []
) => {
    const options = field.options || [];

    for (const candidate of candidates) {
        const match = findEquivalentFormOption(options, candidate);
        if (match) return match;
    }

    return candidates[0];
};

// Recruiting sites frequently phrase the same option differently (for
// example, "I am not a protected veteran" vs. "Not a protected veteran").
// Keep the comparison conservative: exact values win, and any negation must
// agree so "No" can never be mistaken for "Yes".
const semanticOptionText = value => normalizeText(value)
    .replace(/\b(?:i am|im|a|an|the)\b/g, " ")
    .replace(/\bbachelors\b/g, "bachelor")
    .replace(/\bmasters\b/g, "master")
    .replace(/\bdegree\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const hasNegation = value => /\b(?:no|not|never|without|decline)\b/.test(semanticOptionText(value));
const findEquivalentFormOption = (options = [], candidate) => {
    const expected = normalizeText(candidate);
    if (!expected) return null;
    const exact = options.find(option => normalizeText(option) === expected);
    if (exact) return exact;
    if (["yes", "no"].includes(expected)) return null;
    const semanticExpected = semanticOptionText(candidate);
    if (!semanticExpected) return null;
    return options.find(option => {
        const semanticOption = semanticOptionText(option);
        if (!semanticOption || hasNegation(option) !== hasNegation(candidate)) return false;
        return semanticOption === semanticExpected
            || (semanticExpected.length >= 5 && semanticOption.includes(semanticExpected))
            || (semanticOption.length >= 5 && semanticExpected.includes(semanticOption));
    }) || null;
};


const getBooleanFormAnswer = (
    value,
    options = []
) => {
    if (typeof value !== "boolean") {
        return value;
    }

    const normalizedOptions =
        options.map(normalizeText);

    if (value) {
        const yesIndex = normalizedOptions.findIndex(
            option =>
                option === "yes" ||
                option.startsWith("yes ") ||
                option.includes("yes i")
        );

        if (yesIndex !== -1) {
            return options[yesIndex];
        }
    } else {
        const noIndex = normalizedOptions.findIndex(
            option =>
                option === "no" ||
                option.startsWith("no ") ||
                option.includes("no i")
        );

        if (noIndex !== -1) {
            return options[noIndex];
        }
    }

    return value;
};


module.exports = {
    normalizeText,
    getAvailableFormOption,
    findEquivalentFormOption,
    getBooleanFormAnswer
};
