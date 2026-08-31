const SITE_TYPES = Object.freeze({
    ASHBY: "ashby",
    GREENHOUSE: "greenhouse",
    ORACLE: "oracle",
    NETFLIX: "netflix",
    SPACEX: "spacex",
    GENERIC: "generic",
});

const ADAPTERS = Object.freeze({
    [SITE_TYPES.ASHBY]: Object.freeze({
        type: SITE_TYPES.ASHBY,
        ashbyYesNo: true,
    }),
    [SITE_TYPES.GREENHOUSE]: Object.freeze({
        type: SITE_TYPES.GREENHOUSE,
        greenhouseProfileImport: true,
    }),
    [SITE_TYPES.ORACLE]: Object.freeze({
        type: SITE_TYPES.ORACLE,
        oracleAgreementCheckbox: true,
        oracleRadioPills: true,
    }),
    [SITE_TYPES.NETFLIX]: Object.freeze({
        type: SITE_TYPES.NETFLIX,
        acknowledgePrivacy: true,
        netflixQuestions: true,
        customSelects: true,
    }),
    [SITE_TYPES.SPACEX]: Object.freeze({
        type: SITE_TYPES.SPACEX,
        greenhouseProfileImport: true,
        spacexQuestions: true,
        customSelects: true,
    }),
    [SITE_TYPES.GENERIC]: Object.freeze({
        type: SITE_TYPES.GENERIC,
    }),
});

const hasVisibleSelector = async (page, selector) => (
    page.locator(selector).first().isVisible().catch(() => false)
);

const getOraclePagePhase = async page => {
    if (await hasVisibleSelector(page, '[aria-label*="verification code digit" i]')) {
        return "verification";
    }
    if (await hasVisibleSelector(page, [
        ".apply-flow-block--personal-information-basic",
        "name-form",
        '[data-scroll-spy-id="ORA_ESIGNATURE"]',
    ].join(", "))) {
        return "application";
    }
    if (await hasVisibleSelector(page, [
        "#legal-disclaimer-checkbox-label",
        ".apply-flow-input-checkbox",
    ].join(", "))) {
        return "account-setup";
    }
    return "loading";
};

const getApplicationPageIdentity = async (page, adapter) => {
    const baseIdentity = page.url();
    if (adapter.type !== SITE_TYPES.ORACLE) return baseIdentity;
    return `${baseIdentity}::${await getOraclePagePhase(page)}`;
};

const detectApplicationSite = async page => {
    const url = page.url().toLowerCase();

    // SpaceX uses a Greenhouse-backed flow but has its own question schema.
    if (/spacex|spacexai/.test(url)) return ADAPTERS[SITE_TYPES.SPACEX];
    if (/netflix/.test(url)) return ADAPTERS[SITE_TYPES.NETFLIX];
    if (/ashbyhq\.com/.test(url) || await hasVisibleSelector(page, ".ashby-application-form-field-entry")) {
        return ADAPTERS[SITE_TYPES.ASHBY];
    }
    if (/oraclecloud\.com/.test(url) || await hasVisibleSelector(page, ".apply-flow-page")) {
        return ADAPTERS[SITE_TYPES.ORACLE];
    }
    if (/greenhouse\.io|greenhouse\.com/.test(url)
        || await hasVisibleSelector(page, 'button:has-text("Autofill my application")')) {
        return ADAPTERS[SITE_TYPES.GREENHOUSE];
    }
    return ADAPTERS[SITE_TYPES.GENERIC];
};

module.exports = {
    SITE_TYPES,
    detectApplicationSite,
    getApplicationPageIdentity,
};
