const inspectInteractiveElements = async page => {
    console.log("\n========== INTERACTIVE ELEMENTS ==========");

    const interactive = await page.locator(`
        button,
        [role="button"],
        [aria-expanded],
        [tabindex="0"]
    `).evaluateAll(elements =>
        elements.map((element, index) => ({
            index,
            tag: element.tagName,
            role: element.getAttribute("role"),
            text: element.innerText?.trim(),
            ariaExpanded: element.getAttribute("aria-expanded"),
            ariaControls: element.getAttribute("aria-controls"),
            class:
                typeof element.className === "string"
                    ? element.className
                    : ""
        }))
    );

    console.log(JSON.stringify(interactive, null, 2));
    console.log("==========================================");
};


const printApplicationFields = fields => {
    console.log("\n========== NORMALIZED FORM FIELDS ==========");

    fields.forEach(field => {
        console.log(`\nField #${field.index}`);
        console.log("  Type:        ", field.type);
        console.log("  Name:        ", field.name);
        console.log("  ID:          ", field.id);
        console.log("  Question:    ", field.question);
        console.log("  Label:       ", field.label);
        console.log("  Placeholder: ", field.placeholder);
        console.log("  Required:    ", field.required);
        console.log("  System:      ", field.systemField);

        if (field.options.length) {
            console.log("  Options:     ", field.options);
        }
    });

    console.log("\n=============================================");
};


module.exports = {
    inspectInteractiveElements,
    printApplicationFields
};
