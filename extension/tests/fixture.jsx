import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import Select, { components } from "react-select";
import AsyncSelect from "react-select/async";

let listener;
window.chrome = { runtime: { onMessage: { addListener: callback => { listener = callback; } } } };
const send = message => new Promise(resolve => listener(message, {}, resolve));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (condition, message) => { if (!condition) throw new Error(message); };
const root = createRoot(document.getElementById("fixture"));
const selected = {};
let submissions = 0;
const countries = [{ value: "US", label: "United States +1" }, { value: "GB", label: "United Kingdom +44" }];
const cities = [
    { value: "ND", label: "McKinney, North Dakota, United States" },
    { value: "TX", label: "McKinney, Texas, United States" },
    { value: "TX2", label: "McKinney Acres, Texas, United States" },
];
// Greenhouse controls menuIsOpen itself: the wrapper opens on mouseup/key-up,
// not on input change. A vanilla uncontrolled Select cannot reproduce that bug.
const GreenhouseControl = props => <div onMouseUp={props.selectProps.onMouseUp} onKeyUp={props.selectProps.onKeyUp}>
    <components.Control {...props}/>
</div>;
function Dropdown({ id, label, options, asyncOptions, searchable = true, broken = false, valueLabel, buffered = "", delayed = false, placement = "auto" }) {
    const [value, setValue] = useState(null);
    const [error, setError] = useState(true);
    const [open, setOpen] = useState(false);
    const Component = asyncOptions ? AsyncSelect : Select;
    const change = option => {
        setOpen(false);
        if (broken) return;
        const commit = () => { selected[id] = option?.value; setValue(option); setError(false); };
        if (delayed) setTimeout(commit, 450);
        else commit();
    };
    return <div className="select__container">
        <label id={`${id}-label`} htmlFor={id}>{label}</label>
        <Component inputId={id} instanceId={id} classNamePrefix="select" className="select-shell"
            aria-labelledby={`${id}-label`} aria-describedby={`${id}-error`} aria-invalid={error}
            aria-errormessage={`${id}-error`} required isSearchable={searchable} value={value} onChange={change}
            components={{ Control: GreenhouseControl }} menuIsOpen={open} defaultInputValue={buffered}
            onMouseUp={() => setOpen(!open)} onKeyUp={event => { if (["Escape", "Tab"].includes(event.code)) setOpen(false); else if (event.code !== "Enter") setOpen(true); }}
            onBlur={() => { setOpen(false); setError(!value); }} options={options} menuPortalTarget={document.body} menuPlacement={placement}
            loadOptions={asyncOptions ? () => new Promise(resolve => setTimeout(() => resolve(options), 700)) : undefined}
            formatOptionLabel={valueLabel ? (option, meta) => meta.context === "value" ? valueLabel : option.label : undefined}/>
        {error && <div className="error-message" id={`${id}-error`}>{id === "country" ? "Select a country" : "This field is required."}</div>}
    </div>;
}
function Fixture({ only, broken, searchable = true, cityOptions = cities, buffered, delayed, placement, sponsorOptions }) {
    return <form onSubmit={event => { event.preventDefault(); submissions++; }}>
        <div className="field" style={{ display: "flex", gap: 16 }}>
            {(!only || only === "country") && <Dropdown id="country" label="Country" options={countries} valueLabel="+1"/>}
            <div><label htmlFor="phone">Phone</label><input id="phone" defaultValue="5550100"/></div>
        </div>
        {(!only || only === "city") && <Dropdown id="city" label="Location (City)" options={cityOptions} asyncOptions delayed={delayed} placement={placement}/>}
        {(!only || only === "sponsor") && <Dropdown id="sponsor" label="Will you require immigration sponsorship?" options={sponsorOptions || [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} searchable={searchable} broken={broken} buffered={buffered}/>}
        <label htmlFor="plain-city">City (plain text)</label><input id="plain-city"/>
        <div id="decoy" role="listbox"><div role="option">No</div><div role="option">United States +1</div></div>
        <button id="outside" type="button">Outside focus target</button><button type="submit">Submit (must never be clicked)</button>
    </form>;
}
async function mount(props = {}) {
    for (const key of Object.keys(selected)) delete selected[key];
    flushSync(() => root.render(<Fixture key={Math.random()} {...props}/>));
    await pause(40);
}
const scan = async () => (await send({ type: "JOBPILOT_SCAN_FIELDS" })).fields;
const fill = async (id, value, extra = {}) => {
    const fields = await scan();
    const field = fields.find(item => item.fieldKey === id);
    check(field, `${id} was missing from scan`);
    return (await send({ type: "JOBPILOT_APPLY_PLAN", answers: [{ fieldKey: id, value, action: "fill", ...extra }] })).results[0];
};
const tests = [
    ["Country commits an option object and survives real blur", async () => {
        await mount({ only: "country" });
        const outcome = await fill("country", "United States");
        document.getElementById("outside").focus();
        await pause(150);
        check(selected.country === "US", `onChange never committed US (${outcome?.status})`);
        check(outcome.status === "filled", "Country was reported failed despite committing");
        const field = (await scan()).find(item => item.fieldKey === "country");
        check(field?.filled && !field.hasError, "Rescan lost the selected country whose search input is empty/transparent");
        check((await fill("country", "United Kingdom")).status === "skipped", "Existing country was overwritten");
        check(selected.country === "US", "Country changed on a second fill");
    }],
    ["Async city selects Texas, even when North Dakota is the first result", async () => {
        await mount({ only: "city", delayed: true });
        const outcome = await fill("city", "McKinney", { optionContext: { city: "McKinney", state: "Texas", country: "United States" } });
        document.getElementById("outside").focus();
        await pause(150);
        check(selected.city === "TX", `Expected TX selection, got ${selected.city} (${outcome?.status})`);
        check((await scan()).find(item => item.fieldKey === "city")?.filled, "City was not committed after blur");
    }],
    ["Non-searchable sponsorship dropdown commits No", async () => {
        await mount({ only: "sponsor", searchable: false });
        const outcome = await fill("sponsor", "No");
        check(selected.sponsor === "no" && outcome.status === "filled", "No was not committed on the read-only React Select input");
    }],
    ["Invalid buffered answer is repaired instead of skipped", async () => {
        await mount({ only: "sponsor", buffered: "No" });
        const outcome = await fill("sponsor", "false");
        check(selected.sponsor === "no" && outcome.status === "filled", "Buffered answer was not replaced by a committed No option");
    }],
    ["No also selects a False option without filtering it out", async () => {
        await mount({ only: "sponsor", sponsorOptions: [{ value: "yes", label: "True" }, { value: "no", label: "False" }] });
        const outcome = await fill("sponsor", "No");
        check(outcome.status === "filled" && selected.sponsor === "no", "No/False equivalent was not selected");
    }],
    ["Menus opening above the input are supported", async () => {
        await mount({ only: "city", placement: "top" });
        const outcome = await fill("city", "McKinney", { optionContext: { city: "McKinney", state: "Texas", country: "United States" } });
        check(outcome.status === "filled" && selected.city === "TX", "Portaled menu above the control was not selected");
    }],
    ["One Autofill operation commits country, city, and sponsorship", async () => {
        await mount();
        await scan();
        const { results } = await send({ type: "JOBPILOT_APPLY_PLAN", answers: [
            { fieldKey: "country", value: "United States", action: "fill" },
            { fieldKey: "city", value: "McKinney", action: "fill", optionContext: { city: "McKinney", state: "Texas", country: "United States" } },
            { fieldKey: "sponsor", value: "No", action: "fill" },
        ] });
        document.getElementById("outside").focus();
        await pause(100);
        check(results.length === 3 && results.every(result => result.status === "filled"), "Batch Autofill did not fill all three fields");
        check(selected.country === "US" && selected.city === "TX" && selected.sponsor === "no", "Selections changed after subsequent fields were filled");
        check((await scan()).filter(field => ["country", "city", "sponsor"].includes(field.fieldKey)).every(field => field.filled && !field.hasError), "Rescan did not retain all three selections");
    }],
    ["Country validation error is not assigned to Phone", async () => {
        await mount({ only: "country" });
        const fields = await scan();
        check(fields.find(item => item.fieldKey === "country")?.hasError, "Country error was missed");
        check(fields.find(item => item.fieldKey === "country")?.errorMessage === "Select a country", "Associated error text was duplicated");
        check(!fields.find(item => item.fieldKey === "phone")?.hasError, "Country error leaked onto phone");
        check(!fields.some(item => item.label === "Unlabeled field"), "React Select's hidden required proxy was scanned as a question");
    }],
    ["Ordinary city text inputs still fill without a menu", async () => {
        await mount({ only: "country" });
        const outcome = await fill("plain-city", "Austin");
        check(outcome.status === "filled" && document.getElementById("plain-city").value === "Austin", "Plain city input incorrectly required a suggestion");
    }],
    ["Missing option fails without clicking unrelated page text", async () => {
        await mount({ only: "sponsor" });
        const outcome = await fill("sponsor", "Unknown");
        check(outcome.status === "failed" && !selected.sponsor, "A nonmatching suggestion was selected");
    }],
    ["Uncommitted text/menu closure is never reported as success", async () => {
        await mount({ only: "sponsor", broken: true });
        const outcome = await fill("sponsor", "No");
        check(outcome.status === "failed", "A rejected option was reported filled");
        check(!(await scan()).find(item => item.fieldKey === "sponsor")?.filled, "Rejected value was treated as filled on rescan");
    }],
    ["Ambiguous cities require review instead of choosing the first", async () => {
        await mount({ only: "city" });
        const outcome = await fill("city", "McKinney");
        check(outcome.status === "failed" && !selected.city, "An ambiguous city was guessed");
    }],
    ["Nothing submits the application", async () => { check(submissions === 0, "Form was submitted"); }],
];
document.getElementById("run").onclick = async () => {
    const results = document.getElementById("results");
    document.getElementById("run").disabled = true;
    results.textContent = "Running…\n";
    let passed = 0;
    for (const [name, test] of tests) {
        try { await test(); passed++; results.textContent += `PASS ${name}\n`; }
        catch (error) { results.textContent += `FAIL ${name}: ${error.message}\n`; }
    }
    results.textContent += `\n${passed}/${tests.length} passed`;
    results.dataset.complete = "true";
    results.dataset.passed = String(passed);
    document.getElementById("run").disabled = false;
};
mount();
