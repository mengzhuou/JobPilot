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
        const match = options.find(
            option =>
                normalizeText(option) ===
                normalizeText(candidate)
        );

        if (match) {
            return match;
        }
    }

    return candidates[0];
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
    getBooleanFormAnswer
};
