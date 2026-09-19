const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Profile dates are stored as YYYY-MM when created in the editor, but older
// imported profiles can contain YYYY-MM-DD or month-name values. Always render
// the same concise month/year presentation without changing the stored value.
export const formatProfileMonth = value => {
    const raw = String(value || "").trim();
    if (!raw || /^present$/i.test(raw)) return raw ? "Present" : "";

    const numeric = raw.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
    if (numeric) {
        const month = Number(numeric[2]);
        return month >= 1 && month <= 12 ? `${MONTHS[month - 1]} ${numeric[1]}` : raw;
    }

    const named = raw.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (named) {
        const month = MONTHS.findIndex(item => item.toLowerCase() === named[1].slice(0, 3).toLowerCase());
        return month >= 0 ? `${MONTHS[month]} ${named[2]}` : raw;
    }

    return raw;
};
