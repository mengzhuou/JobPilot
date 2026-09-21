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
function AshbyFixture() {
    const [answer, setAnswer] = useState("");
    return <div>
        <div className="ashby-application-form-field-entry"><label className="ashby-application-form-question-title _required_test" htmlFor="ashby-name">Full Name</label><div><input id="ashby-name" required/></div></div>
        <div className="ashby-application-form-field-entry"><label className="ashby-application-form-question-title _required_test">Will you require Notion to sponsor an immigration case?</label>
            <div className="ashby-application-form-input-yesno">{["Yes", "No"].map(text => <button type="button" key={text} data-option={text.toLowerCase()} aria-pressed={answer === text} onClick={() => setAnswer(text)}>{text}</button>)}<input type="checkbox" style={{display:"none"}}/></div>
        </div>
        <div className="ashby-application-form-field-entry"><label className="ashby-application-form-question-title">Veteran Status</label>{["I am not a protected veteran", "I decline to self-identify"].map((text,i) => <label key={text}><input type="radio" name="ashby-vet" id={`ashby-vet-${i}`}/>{text}</label>)}</div>
    </div>;
}
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
function Fixture({ only, broken, searchable = true, cityOptions = cities, buffered, delayed, placement, sponsorOptions, degreeOptions }) {
    if (only === "ashby") return <AshbyFixture/>;
    return <form onSubmit={event => { event.preventDefault(); submissions++; }}>
        <div className="field" style={{ display: "flex", gap: 16 }}>
            {(!only || only === "country") && <Dropdown id="country" label="Country" options={countries} valueLabel="+1"/>}
            <div><label htmlFor="phone">Phone</label><input id="phone" defaultValue="5550100"/></div>
        </div>
        {(!only || only === "city") && <Dropdown id="city" label="Location (City)" options={cityOptions} asyncOptions delayed={delayed} placement={placement}/>}
        {(!only || only === "sponsor") && <Dropdown id="sponsor" label="Will you require immigration sponsorship?" options={sponsorOptions || [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} searchable={searchable} broken={broken} buffered={buffered}/>}
        <label htmlFor="plain-city">City (plain text)</label><input id="plain-city"/>
        {only === "checkboxes" && <>
            <fieldset><legend>How did you hear about us? *</legend>
                {["Website", "Career Fair", "Conference"].map((label, i) => <label key={label}><input type="checkbox" name="source[]" required defaultChecked={i === 0}/>{label}</label>)}
            </fieldset>
            <fieldset><legend>Required acknowledgements</legend>
                <label><input id="consent" type="checkbox" name="consent[]" required/>Accept privacy policy</label>
                <label><input type="checkbox" name="consent[]" required/>Confirm accuracy</label>
            </fieldset>
        </>}
        {only === "degree" && <Dropdown id="degree" label="Degree" buffered={buffered} asyncOptions options={degreeOptions || [{ value: "associate", label: "Associate's Degree" }, { value: "bachelor", label: "Bachelor's Degree" }, { value: "master", label: "Master's Degree" }]}/>}
        <div id="decoy" role="listbox"><div role="option">No</div><div role="option">United States +1</div></div>
        <button id="outside" type="button">Outside focus target</button><button type="submit">Submit application</button>
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
    ["Standalone Ashby EEOC fieldsets detect and fill hidden radio controls", async () => {
        flushSync(() => root.render(<>{[["Gender", ["Male", "Female"]], ["Race", ["Hispanic or Latino", "Asian (Not Hispanic or Latino)"]], ["Veteran Status", ["I am not a protected veteran", "I decline to self-identify"]]].map(([question, options], g) =>
            <fieldset key={question} className="ashby-application-form-input-radio-group">
                <label className="ashby-application-form-question-title">{question}</label>
                <div className="ashby-application-form-question-description">Explanatory text, not the question.</div>
                {options.map((label, i) => <div key={label}><span><input id={`eeoc-${g}-${i}`} name={`eeoc-${g}`} type="radio" style={{opacity:0}}/></span><label htmlFor={`eeoc-${g}-${i}`}>{label}</label></div>)}
            </fieldset>)}</>));
        const fields = await scan();
        check(fields.length === 3 && fields.map(f => f.label).join('|') === 'Gender|Race|Veteran Status', 'Demographic questions missing or mislabeled');
        for (const [id, value] of [['eeoc-0-0', 'Female'], ['eeoc-1-0', 'Asian (Not Hispanic or Latino)'], ['eeoc-2-0', 'I am not a protected veteran']]) {
            check((await fill(id, value)).status === 'filled', `${id} did not commit saved choice`);
        }
        check((await scan()).every(f => f.filled), 'EEOC selections were lost on rescan');
        check((await fill('eeoc-0-0','Male')).status === 'skipped', 'Existing demographic choice was overwritten');
    }],
    ["Nested Ashby education uses local labels and empty dates remain unfilled", async () => {
        flushSync(() => root.render(<div className="ashby-application-form-field-entry">
            <label className="ashby-application-form-question-title _required_test">Education History</label>
            <div><label className="ashby-application-form-question-title" htmlFor="degree-nested">Degree</label><input id="degree-nested"/></div>
            <div><label className="ashby-application-form-question-title">Start Date</label><div><select id="month-nested" defaultValue=""><option value="" disabled>Month...</option><option value="1">January</option></select></div></div>
        </div>));
        const fields = await scan();
        check(fields.find(field => field.fieldKey === "degree-nested")?.label === "Degree", "Education History swallowed Degree label");
        const month = fields.find(field => field.fieldKey === "month-nested");
        check(month.label === "Education Start Date Month" && !month.filled && !month.required, "Optional empty date is misclassified");
        check((await fill("degree-nested", "Bachelor of Science")).status === "filled", "Nested degree failed to fill");
    }],
    ["Radio groups with the same name in separate forms stay independent", async () => {
        flushSync(() => root.render(<>{["one", "two"].map(id => <form key={id}><fieldset><legend>Choice</legend><label><input id={`${id}-yes`} type="radio" name="choice" value="Yes"/>Yes</label><label><input type="radio" name="choice" value="No"/>No</label></fieldset></form>)}</>));
        const fields = await scan();
        check(fields.filter(field => field.type === "radio").length === 2, "Independent forms merged");
        await fill("two-yes", "Yes");
        check(document.getElementById("two-yes").checked && !document.getElementById("one-yes").checked, "Wrong form radio was selected");
    }],
    ["Ashby question labels and button-based No answers are scanned, committed and skipped", async () => {
        await mount({ only: "ashby" });
        document.querySelectorAll('input[name="ashby-vet"]').forEach(input => { input.style.opacity = "0"; });
        let fields = await scan();
        const sponsor = fields.find(field => field.label.includes("sponsor an immigration case"));
        check(sponsor?.type === "select" && sponsor.required && !sponsor.filled, "Ashby Yes/No group missing");
        check(fields.find(field => field.fieldKey === "ashby-vet-0")?.label === "Veteran Status", "Radio option replaced the question");
        check((await fill(sponsor.fieldKey, "No")).status === "filled", "Ashby No button did not commit");
        fields = await scan();
        check(fields.find(field => field.fieldKey === sponsor.fieldKey)?.currentValue === "No", "No was treated as empty/false");
        check((await fill(sponsor.fieldKey, "Yes")).status === "skipped", "Existing No answer was overwritten");
        check((await fill("ashby-vet-0", "I am not a protected veteran")).status === "filled", "Ashby veteran option failed");
    }],
    ["Selected checkbox question is one filled answer, not errors for unchecked alternatives", async () => {
        await mount({ only: "checkboxes" });
        const fields = await scan();
        const group = fields.find(field => field.type === "checkbox-group");
        check(group?.filled && !group.hasError && group.currentValue === "Website", "Selected source group incorrectly reports missing options");
        check(group.options.length === 3, "Checkbox choices were lost");
        check(!fields.some(field => field.label === "Career Fair"), "Unchecked choice is still a separate required question");
        check(fields.find(field => field.fieldKey === "consent")?.hasError, "Independent required consent was suppressed");
        document.querySelector('input[name="source[]"]').click();
        check((await scan()).find(field => field.type === "checkbox-group")?.hasError, "Empty required group must still report an error");
    }],
    ["Full degree title commits Bachelor's Degree and clears validation after blur", async () => {
        await mount({ only: "degree", buffered: "Bachelor of Science in Computer Science" });
        const outcome = await fill("degree", "Bachelor of Science in Computer Science", { optionContext: { degreeLabel: "Bachelor's Degree" } });
        document.getElementById("outside").focus();
        await pause(150);
        check(outcome.status === "filled" && selected.degree === "bachelor", "Degree option was not committed");
        const field = (await scan()).find(item => item.fieldKey === "degree");
        check(field.filled && !field.hasError, "Degree validation did not clear");
    }],
    ["Degree matching does not invent a different major", async () => {
        await mount({ only: "degree", degreeOptions: [{ value: "arts", label: "Bachelor of Arts" }] });
        const outcome = await fill("degree", "Bachelor of Science in Computer Science", { optionContext: { degreeLabel: "Bachelor's Degree" } });
        check(outcome.status === "failed" && !selected.degree, "Different degree specialization was guessed");
    }],
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
    ["Submit is blocked with errors and enabled only after committed required answers", async () => {
        await mount({ only: "sponsor" });
        let snapshot = await send({ type: "JOBPILOT_SCAN_FIELDS" });
        check(!snapshot.submission.ready, "Invalid form enabled Submit");
        check(!(await send({ type: "JOBPILOT_SUBMIT_FORM" })).submitted && submissions === 0, "Invalid form submitted");
        await fill("sponsor", "No");
        snapshot = await send({ type: "JOBPILOT_SCAN_FIELDS" });
        check(snapshot.submission.ready, "Complete form did not enable Submit");
        check(snapshot.fields.some(field => field.fieldKey === "plain-city" && !field.required && !field.filled), "Fixture must include an empty optional field");
        check((await send({ type: "JOBPILOT_SUBMIT_FORM" })).submitted, "Explicit submit failed");
        check(submissions === 1, "Site submit handler was not invoked exactly once");
        check(!(await send({ type: "JOBPILOT_SUBMIT_FORM" })).submitted && submissions === 1, "Double submit was not blocked");
    }],
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
