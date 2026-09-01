import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation as useRouteLocation, useNavigate } from "react-router-dom";
import { getActiveJobPostings, setJobPreference } from "../../../connector";
import "./ActiveJobPostings.scss";

const FILTER_STORAGE_KEY = "jobpilot.activeJobAdvancedFilters.v1";
const DEFAULT_LEVEL_OPTIONS = ["Principal", "Staff", "Senior", "Embedded", "Manager"];
const JOB_TYPE_OPTIONS = [
    { value: "full_time", label: "Full-time" },
    { value: "coop", label: "Co-op" },
    { value: "intern", label: "Intern" },
];
const SKILL_OPTIONS = ["React", "Java", "JavaScript", "TypeScript", "Python", "Node.js", "C++", "Kubernetes", "AWS", "PostgreSQL"];
const FOCUS_OPTIONS = [{ value: "web", label: "Web" }, { value: "mobile", label: "Mobile" }, { value: "embedded", label: "Embedded" }];
const ELIGIBILITY_EXCLUSIONS = [{ value: "citizenship", label: "Requires U.S. citizenship" }, { value: "clearance", label: "Requires security clearance" }, { value:"no_sponsorship", label:"Does not offer sponsorship" }];
const PLATFORM_OPTIONS = ["Greenhouse", "Lever", "LinkedIn", "Ashby", "Oracle", "Eightfold"];

const ChipMultiSelect = ({ label, values, onChange, options, placeholder, allowCustom = true }) => {
    const [input, setInput] = useState("");
    const [open, setOpen] = useState(false);
    const normalizedOptions = options.map(option => typeof option === "string" ? { value: option, label: option } : option);
    const suggestions = normalizedOptions.filter(option => !values.some(value => value.toLowerCase() === option.value.toLowerCase()))
        .filter(option => option.label.toLowerCase().includes(input.trim().toLowerCase()));
    const add = rawValue => {
        const value = String(rawValue || "").trim().replace(/,$/, "");
        if (value && !values.some(item => item.toLowerCase() === value.toLowerCase())) onChange([...values, value]);
        setInput("");
    };
    return <label className="multi-select-filter"><span className="filter-field-label">{label}{values.length > 0 && <b>{values.length}</b>}</span>
        <div className="location-autocomplete"><div className="location-chip-input">
            {values.map(value => { const option = normalizedOptions.find(item => item.value.toLowerCase() === value.toLowerCase()); return <span key={value}>{option?.label || value}<button type="button" aria-label={`Remove ${option?.label || value}`} onClick={() => onChange(values.filter(item => item !== value))}>×</button></span>; })}
            <input readOnly={!allowCustom} value={input} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (allowCustom && (event.key === "Enter" || event.key === ",") && input.trim()) { event.preventDefault(); add(input); } }} placeholder={values.length ? "Add another" : placeholder} role="combobox" aria-controls={`${label.replace(/\W+/g, "-").toLowerCase()}-suggestions`} aria-expanded={open && suggestions.length > 0} />
        </div>{open && suggestions.length > 0 && <div className="location-suggestions" id={`${label.replace(/\W+/g, "-").toLowerCase()}-suggestions`} role="listbox">{suggestions.map(option => <button type="button" role="option" aria-selected="false" key={option.value} onMouseDown={event => event.preventDefault()} onClick={() => add(option.value)}>{option.label}</button>)}</div>}</div>
    </label>;
};
const getSavedFilters = () => {
    try { return JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY)) || {}; }
    catch { return {}; }
};

const formatPostedDate = (date) => {
    if (!date) {
        return "Date unavailable";
    }

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(date));
};

const ActiveJobPostings = () => {
    const savedFilters = React.useMemo(getSavedFilters, []);
    const navigate = useNavigate();
    const routeLocation = useRouteLocation();
    const [query, setQuery] = useState("software engineer");
    const [jobs, setJobs] = useState([]);
    const [sources, setSources] = useState([]);
    const [companiesChecked, setCompaniesChecked] = useState(0);
    const [companiesAvailable, setCompaniesAvailable] = useState(0);
    const [fetchedAt, setFetchedAt] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState("");
    const [displayFilter, setDisplayFilter] = useState("all");
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [includeCompanies, setIncludeCompanies] = useState(Array.isArray(savedFilters.includeCompanies) ? savedFilters.includeCompanies : (savedFilters.company ? [savedFilters.company] : []));
    const [excludeCompanies, setExcludeCompanies] = useState(Array.isArray(savedFilters.excludeCompanies) ? savedFilters.excludeCompanies : String(savedFilters.excludeCompany || "").split(",").map(value => value.trim()).filter(Boolean));
    const [requiredSkills, setRequiredSkills] = useState(Array.isArray(savedFilters.requiredSkills) ? savedFilters.requiredSkills : String(savedFilters.keywords || "").split(",").map(value => value.trim()).filter(Boolean));
    const [remoteOnly, setRemoteOnly] = useState(Boolean(savedFilters.remoteOnly));
    const [excludeFocuses, setExcludeFocuses] = useState(Array.isArray(savedFilters.excludeFocuses) ? savedFilters.excludeFocuses : []);
    const [excludeEligibility, setExcludeEligibility] = useState(Array.isArray(savedFilters.excludeEligibility) ? savedFilters.excludeEligibility : []);
    const [excludeJobTypes, setExcludeJobTypes] = useState(Array.isArray(savedFilters.excludeJobTypes) ? savedFilters.excludeJobTypes : []);
    const [showJobTypeSuggestions, setShowJobTypeSuggestions] = useState(false);
    const [postedWithin, setPostedWithin] = useState(savedFilters.postedWithin || "all");
    const [locations, setLocations] = useState(Array.isArray(savedFilters.locations) ? savedFilters.locations.filter(value => !/remote/i.test(value)) : []);
    const [locationChipInput, setLocationChipInput] = useState("");
    const [excludeLevels, setExcludeLevels] = useState(Array.isArray(savedFilters.excludeLevels) ? savedFilters.excludeLevels : []);
    const [excludeLevelInput, setExcludeLevelInput] = useState("");
    const [excludeLevelOptions, setExcludeLevelOptions] = useState(DEFAULT_LEVEL_OPTIONS);
    const [showExcludeLevelSuggestions, setShowExcludeLevelSuggestions] = useState(false);
    const [includeLevels, setIncludeLevels] = useState(Array.isArray(savedFilters.includeLevels) ? savedFilters.includeLevels : []);
    const [excludePlatforms, setExcludePlatforms] = useState(Array.isArray(savedFilters.excludePlatforms) ? savedFilters.excludePlatforms : []);
    const [includeLevelInput, setIncludeLevelInput] = useState("");
    const [showIncludeLevelSuggestions, setShowIncludeLevelSuggestions] = useState(false);
    const [applyClearedFilters, setApplyClearedFilters] = useState(false);
    const activeAdvancedFilters = [includeCompanies.length > 0, excludeCompanies.length > 0, requiredSkills.length > 0, remoteOnly, excludeFocuses.length > 0, excludeEligibility.length > 0, excludeJobTypes.length > 0, excludePlatforms.length > 0, postedWithin !== "all", locations.length > 0, excludeLevels.length > 0, includeLevels.length > 0]
        .filter(Boolean).length;
    const locationSuggestions = useMemo(() => Array.from(new Set([
        ...jobs.flatMap(job => String(job.location || "").split(" · ").map(value => value.trim()).filter(Boolean)),
    ])).filter(value => !/remote/i.test(value) && !locations.includes(value) && value.toLowerCase().includes(locationChipInput.trim().toLowerCase())).slice(0, 8), [jobs, locationChipInput, locations]);
    const companyOptions = useMemo(() => Array.from(new Set([
        ...sources.map(source => source.name).filter(Boolean),
        ...jobs.map(job => job.company).filter(Boolean),
    ])).sort((first, second) => first.localeCompare(second)), [jobs, sources]);
    const excludeLevelSuggestions = useMemo(() => excludeLevelOptions
        .filter(value => !excludeLevels.some(selected => selected.toLowerCase() === value.toLowerCase()))
        .filter(value => value.toLowerCase().includes(excludeLevelInput.trim().toLowerCase())), [excludeLevelInput, excludeLevelOptions, excludeLevels]);
    const includeLevelSuggestions = useMemo(() => excludeLevelOptions
        .filter(value => !includeLevels.some(selected => selected.toLowerCase() === value.toLowerCase()))
        .filter(value => value.toLowerCase().includes(includeLevelInput.trim().toLowerCase())), [includeLevelInput, excludeLevelOptions, includeLevels]);

    const loadJobs = useCallback(async ({
        forceRefresh = false,
        targetPage = 1,
        append = false,
        silent = false,
    } = {}) => {
        if (silent) {
            // Keep the first batch visible while the server fills the catalogue.
        } else if (append) {
            setIsLoadingMore(true);
        } else {
            setIsLoading(true);
        }
        if (!silent) setError("");

        try {
            const result = await getActiveJobPostings({
                query,
                refresh: forceRefresh,
                page: targetPage,
                limit: 30,
                company: includeCompanies.join(","),
                excludeCompany: excludeCompanies.join(","),
                keywords: requiredSkills.join(","),
                remoteOnly,
                excludeFocuses,
                excludeEligibility,
                excludeJobTypes,
                applicationState: displayFilter,
                postedWithin,
                locations,
                excludeLevels,
                includeLevels,
                excludePlatforms,
            });

            setJobs((currentJobs) => {
                if (!append) {
                    return result.jobs || [];
                }

                const combinedJobs = [
                    ...currentJobs,
                    ...(result.jobs || []),
                ];

                return Array.from(
                    new Map(
                        combinedJobs.map((job) => [job.id, job])
                    ).values()
                );
            });
            setSources(result.sources || []);
            setCompaniesChecked(result.companiesChecked || 0);
            setCompaniesAvailable(result.companiesAvailable || 0);
            setFetchedAt(result.fetchedAt || null);
            setPage(result.page || targetPage);
            setTotal(result.total || 0);
            setHasMore(Boolean(result.hasMore));
            setIsRefreshing(Boolean(result.refreshing));
            setExcludeLevelOptions(Array.from(new Set([...DEFAULT_LEVEL_OPTIONS, ...(result.excludeLevelOptions || [])])));
        } catch (requestError) {
            setError(
                requestError.response?.data?.message ||
                requestError.message ||
                "Unable to load active job postings."
            );
        } finally {
            if (silent) {
                // No loading-state transition for background catalogue updates.
            } else if (append) {
                setIsLoadingMore(false);
            } else {
                setIsLoading(false);
            }
        }
    }, [displayFilter, excludeCompanies, excludeEligibility, excludeFocuses, excludeJobTypes, excludeLevels, excludePlatforms, includeCompanies, includeLevels, locations, postedWithin, query, remoteOnly, requiredSkills]);

    useEffect(() => {
        loadJobs({ targetPage: 1 });
        // Searches are submitted explicitly; application-state tabs reload server totals.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [displayFilter]);

    useEffect(() => {
        const refreshAfterApplicationConfirmation = event => {
            if (event.key !== "jobpilot.application.confirmed" || !event.newValue) return;
            loadJobs({ targetPage: 1, silent: true });
        };
        window.addEventListener("storage", refreshAfterApplicationConfirmation);
        return () => window.removeEventListener("storage", refreshAfterApplicationConfirmation);
    }, [loadJobs]);

    useEffect(() => {
        if (!isRefreshing) return undefined;
        const timer = window.setTimeout(() => {
            loadJobs({ targetPage: 1, silent: true });
        }, 1500);
        return () => window.clearTimeout(timer);
    }, [isRefreshing, loadJobs]);

    useEffect(() => {
        if (!applyClearedFilters) return;
        setApplyClearedFilters(false);
        loadJobs({ targetPage: 1 });
    }, [applyClearedFilters, loadJobs]);

    const clearAdvancedFilters = () => {
        setIncludeCompanies([]);
        setExcludeCompanies([]);
        setRequiredSkills([]);
        setRemoteOnly(false);
        setExcludeFocuses([]);
        setExcludeEligibility([]);
        setExcludeJobTypes([]);
        setShowJobTypeSuggestions(false);
        setPostedWithin("all");
        setLocations([]);
        setLocationChipInput("");
        setExcludeLevels([]);
        setExcludeLevelInput("");
        setShowExcludeLevelSuggestions(false);
        setIncludeLevels([]);
        setExcludePlatforms([]);
        setIncludeLevelInput("");
        setShowIncludeLevelSuggestions(false);
        localStorage.removeItem(FILTER_STORAGE_KEY);
        setApplyClearedFilters(true);
    };

    useEffect(() => {
        localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
            includeCompanies, excludeCompanies, requiredSkills, remoteOnly,
            excludeFocuses, excludeEligibility, excludeJobTypes,
            postedWithin,
            locations, excludeLevels, includeLevels,
            excludePlatforms,
        }));
    }, [includeCompanies, excludeCompanies, requiredSkills, remoteOnly, excludeFocuses, excludeEligibility, excludeJobTypes, excludePlatforms, postedWithin, locations, excludeLevels, includeLevels]);

    useEffect(() => {
        if (!routeLocation.state?.confirmedJobUrl) return undefined;
        const timer = window.setTimeout(() => {
            navigate(routeLocation.pathname, { replace: true, state: null });
        }, 3000);
        return () => window.clearTimeout(timer);
    }, [navigate, routeLocation.pathname, routeLocation.state]);

    const visibleJobs = jobs.filter(job => {
        if (job.currentUserBlocked) return false;
        return true;
    });

    const handleSearch = (event) => {
        event.preventDefault();
        loadJobs();
    };

    const addLocationChip = value => {
        const matchedLocation = locationSuggestions.find(item => item.toLowerCase() === value.trim().toLowerCase());
        if (matchedLocation) {
            setLocations(current => [...current, matchedLocation]);
        }
        setLocationChipInput("");
    };

    const addExcludeLevel = value => {
        const normalizedValue = value.trim().replace(/,$/, "");
        if (normalizedValue && !excludeLevels.some(item => item.toLowerCase() === normalizedValue.toLowerCase())) {
            const suggestedValue = excludeLevelOptions.find(item => item.toLowerCase() === normalizedValue.toLowerCase());
            setExcludeLevels(current => [...current, suggestedValue || normalizedValue]);
        }
        setExcludeLevelInput("");
    };

    const addIncludeLevel = value => {
        const normalizedValue = value.trim().replace(/,$/, "");
        if (normalizedValue && !includeLevels.some(item => item.toLowerCase() === normalizedValue.toLowerCase())) {
            const suggestedValue = excludeLevelOptions.find(item => item.toLowerCase() === normalizedValue.toLowerCase());
            setIncludeLevels(current => [...current, suggestedValue || normalizedValue]);
        }
        setIncludeLevelInput("");
    };

    const addExcludedJobType = value => {
        setExcludeJobTypes(current => current.includes(value) ? current : [...current, value]);
    };

    const startAutofill = (job) => {
        const autofillJob = {
                jobUrl: job.url,
                jobTitle: job.title,
                company: job.company,
                location: job.location,
                source: job.source,
                externalJobId: job.id,
                employmentType: job.employmentType,
                workplaceType: job.workplaceType,
                jobPostedAt: job.postedAt,
                salary: job.salary,
                provider: job.provider,
                tags: job.tags,
                summary: job.summary,
                requirements: job.requirements,
        };
        const storageKey = `jobpilot.autofill.${Date.now()}.${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(storageKey, JSON.stringify(autofillJob));
        window.open(`/autofill?job=${encodeURIComponent(storageKey)}`, "_blank", "noopener,noreferrer");
        window.setTimeout(() => localStorage.removeItem(storageKey), 60_000);
    };

    const updatePreference = async (job, state) => {
        try {
            await setJobPreference({ state, jobUrl:job.url, jobTitle:job.title,
                company:job.company, location:job.location, source:job.source,
                externalJobId:job.id, employmentType:job.employmentType,
                workplaceType:job.workplaceType, jobPostedAt:job.postedAt,
                salary:job.salary, provider:job.provider, tags:job.tags,
                summary:job.summary, requirements:job.requirements });
            setJobs(current => current.map(item => item.id === job.id
                ? { ...item, currentUserSaved:state === "saved", currentUserBlocked:state === "blocked" }
                : item));
        } catch (requestError) {
            setError(requestError.response?.data?.message || "Unable to update this job.");
        }
    };

    return (
        <main className="active-jobs-page">
            <section className="active-jobs-header">
                <div>
                    <span className="active-jobs-eyebrow">
                        Job discovery
                    </span>
                    <h1>Active Job Postings</h1>
                    <p>
                        Browse software engineering roles explicitly
                        available to candidates in the United States.
                    </p>
                </div>

                <button
                    className="refresh-jobs-button"
                    type="button"
                    onClick={() => loadJobs({ forceRefresh: true })}
                    disabled={isLoading || isLoadingMore}
                >
                    {isLoading ? "Refreshing..." : "Refresh sources"}
                </button>
            </section>

            <form className="job-search-panel" onSubmit={handleSearch}>
                <label className="simple-keyword-search">
                    Role or technology
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Software engineer, React, Java..."
                    />
                </label>

                <button
                    type="submit"
                    disabled={isLoading || isLoadingMore}
                >
                    Search jobs
                </button>
            </form>

            <section className="advanced-filter-shell" aria-label="Advanced job filters">
                <div className="advanced-filter-heading">
                    <div><span>Refine results</span><strong>Advanced filters</strong></div>
                    <div className="advanced-filter-heading-actions">
                        {activeAdvancedFilters > 0 && <button className="clear-filters" type="button" onClick={clearAdvancedFilters}>Clear filters</button>}
                        <button className="advanced-filter-toggle" type="button" onClick={() => setShowAdvanced(value => !value)}>{showAdvanced ? "Hide filters" : "Show filters"}{activeAdvancedFilters > 0 && <b>{activeAdvancedFilters}</b>}</button>
                    </div>
                </div>
                {showAdvanced && <div className="advanced-filter-panel">
                    <label className="advanced-filter-wide">Available Locations
                        <div className="location-autocomplete">
                            <div className="location-chip-input">
                                {locations.map(item => <span key={item}>{item}<button type="button" aria-label={`Remove ${item}`} onClick={() => setLocations(current => current.filter(locationItem => locationItem !== item))}>×</button></span>)}
                                <input value={locationChipInput} onChange={event => setLocationChipInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && locationSuggestions[0]) { event.preventDefault(); addLocationChip(locationSuggestions[0]); } }} placeholder="Start typing a city, state" role="combobox" aria-controls="location-filter-suggestions" aria-expanded={Boolean(locationChipInput && locationSuggestions.length)} />
                            </div>
                            {locationChipInput && locationSuggestions.length > 0 && <div className="location-suggestions" id="location-filter-suggestions" role="listbox">{locationSuggestions.map(item => <button type="button" role="option" aria-selected="false" key={item} onMouseDown={event => event.preventDefault()} onClick={() => addLocationChip(item)}>{item}</button>)}</div>}
                            <br/>
                            <label className="remote-filter"><input type="checkbox" lassName="remote-filter" checked={remoteOnly} onChange={event => setRemoteOnly(event.target.checked)} /> Remote jobs</label>
                        </div>
                    </label>
                    <ChipMultiSelect label="Exclude companies" values={excludeCompanies} onChange={setExcludeCompanies} options={companyOptions} placeholder="e.g. Amazon, Meta" />
                    <label className="multi-select-filter"><span className="filter-field-label">Exclude titles / levels{excludeLevels.length > 0 && <b>{excludeLevels.length}</b>}</span>
                        <div className="location-autocomplete">
                            <div className="location-chip-input">
                                {excludeLevels.map(item => <span key={item}>{item}<button type="button" aria-label={`Remove ${item}`} onClick={() => setExcludeLevels(current => current.filter(level => level !== item))}>×</button></span>)}
                                <input value={excludeLevelInput} onFocus={() => setShowExcludeLevelSuggestions(true)} onBlur={() => setShowExcludeLevelSuggestions(false)} onChange={event => setExcludeLevelInput(event.target.value)} onKeyDown={event => { if ((event.key === "Enter" || event.key === ",") && excludeLevelInput.trim()) { event.preventDefault(); addExcludeLevel(excludeLevelInput); } }} placeholder="e.g. Senior, Staff" role="combobox" aria-controls="exclude-level-suggestions" aria-expanded={showExcludeLevelSuggestions && Boolean(excludeLevelSuggestions.length)} />
                            </div>
                            {showExcludeLevelSuggestions && excludeLevelSuggestions.length > 0 && <div className="location-suggestions" id="exclude-level-suggestions" role="listbox">{excludeLevelSuggestions.map(item => <button type="button" role="option" aria-selected="false" key={item} onMouseDown={event => event.preventDefault()} onClick={() => addExcludeLevel(item)}>{item}</button>)}</div>}
                        </div>
                    </label>
                    <label className="multi-select-filter"><span className="filter-field-label">Exclude job types{excludeJobTypes.length > 0 && <b>{excludeJobTypes.length}</b>}</span>
                        <div className="location-autocomplete">
                            <div className="location-chip-input">
                                {excludeJobTypes.map(value => { const option = JOB_TYPE_OPTIONS.find(item => item.value === value); return <span key={value}>{option?.label || value}<button type="button" aria-label={`Remove ${option?.label || value}`} onClick={() => setExcludeJobTypes(current => current.filter(item => item !== value))}>×</button></span>; })}
                                <input readOnly value="" onFocus={() => setShowJobTypeSuggestions(true)} onBlur={() => setShowJobTypeSuggestions(false)} placeholder={excludeJobTypes.length ? "Add another" : "Select job types"} role="combobox" aria-controls="exclude-job-type-suggestions" aria-expanded={showJobTypeSuggestions} />
                            </div>
                            {showJobTypeSuggestions && JOB_TYPE_OPTIONS.some(option => !excludeJobTypes.includes(option.value)) && <div className="location-suggestions" id="exclude-job-type-suggestions" role="listbox">{JOB_TYPE_OPTIONS.filter(option => !excludeJobTypes.includes(option.value)).map(option => <button type="button" role="option" aria-selected="false" key={option.value} onMouseDown={event => event.preventDefault()} onClick={() => addExcludedJobType(option.value)}>{option.label}</button>)}</div>}
                        </div>
                    </label>
                    <ChipMultiSelect label="Include companies" values={includeCompanies} onChange={setIncludeCompanies} options={companyOptions} placeholder="e.g. Google, Stripe" />
                    <label className="multi-select-filter"><span className="filter-field-label">Include titles / levels{includeLevels.length > 0 && <b>{includeLevels.length}</b>}</span>
                        <div className="location-autocomplete">
                            <div className="location-chip-input">
                                {includeLevels.map(item => <span key={item}>{item}<button type="button" aria-label={`Remove ${item}`} onClick={() => setIncludeLevels(current => current.filter(level => level !== item))}>×</button></span>)}
                                <input value={includeLevelInput} onFocus={() => setShowIncludeLevelSuggestions(true)} onBlur={() => setShowIncludeLevelSuggestions(false)} onChange={event => setIncludeLevelInput(event.target.value)} onKeyDown={event => { if ((event.key === "Enter" || event.key === ",") && includeLevelInput.trim()) { event.preventDefault(); addIncludeLevel(includeLevelInput); } }} placeholder="e.g. Junior, Associate" role="combobox" aria-controls="include-level-suggestions" aria-expanded={showIncludeLevelSuggestions && Boolean(includeLevelSuggestions.length)} />
                            </div>
                            {showIncludeLevelSuggestions && includeLevelSuggestions.length > 0 && <div className="location-suggestions" id="include-level-suggestions" role="listbox">{includeLevelSuggestions.map(item => <button type="button" role="option" aria-selected="false" key={item} onMouseDown={event => event.preventDefault()} onClick={() => addIncludeLevel(item)}>{item}</button>)}</div>}
                        </div>
                    </label>
                    <ChipMultiSelect label="Include skills" values={requiredSkills} onChange={setRequiredSkills} options={SKILL_OPTIONS} placeholder="e.g. React, Java" />
                    <ChipMultiSelect label="Exclude engineering focus" values={excludeFocuses} onChange={setExcludeFocuses} options={FOCUS_OPTIONS} placeholder="Select focus areas" allowCustom={false} />
                    <label>Date posted
                        <select value={postedWithin} onChange={event => setPostedWithin(event.target.value)}>
                            <option value="all">Any posting date</option>
                            <option value="day">New in the last 24 hours</option>
                            <option value="week">Posted within 1 week</option>
                            <option value="month">Posted within 1 month</option>
                            <option value="three_months">Posted within 3 months</option>
                            <option value="six_months">Posted within 6 months</option>
                        </select>
                    </label>
                    <ChipMultiSelect label="Exclude authorization requirements" values={excludeEligibility} onChange={setExcludeEligibility} options={ELIGIBILITY_EXCLUSIONS} placeholder="Select requirements" allowCustom={false} />
                    <ChipMultiSelect label="Exclude application platforms" values={excludePlatforms} onChange={setExcludePlatforms} options={PLATFORM_OPTIONS} placeholder="Select platforms" allowCustom={false} />
                    <div className="advanced-filter-actions"><button type="button" onClick={() => loadJobs()}>Apply filters</button></div>
                </div>}
            </section>

            {routeLocation.state?.confirmedJobUrl && (
                <div className="application-saved-banner" role="status">
                    Application saved. This job is now marked as applied.
                </div>
            )}

            <div className="job-display-filters" aria-label="Filter jobs by application state">
                {[
                    ["all", "All jobs"],
                    ["not_applied", "Not yet applied"],
                    ["applied", "Applied"],
                ].map(([value, label]) => (
                    <button key={value} type="button" className={displayFilter === value ? "active" : ""} onClick={() => setDisplayFilter(value)}>
                        {label}
                    </button>
                ))}
            </div>

            <div className="job-results-summary">
                <span>
                    <strong>{total}</strong>{" "}
                    {total === 1 ? "posting" : "postings"}
                    {total > jobs.length && (
                        <> · showing {jobs.length}</>
                    )}
                </span>
                <span>
                    Company sites:{" "}
                    {companiesAvailable || sources.filter(
                        (source) => source.status === "available"
                    ).length}
                    /{companiesChecked || sources.length} available
                    {isRefreshing && " · updating…"}
                </span>
                {fetchedAt && (
                    <span>
                        Updated {new Date(fetchedAt).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                        })}
                    </span>
                )}
            </div>

            {error && <div className="job-results-error">{error}</div>}

            {isLoading ? (
                <div className="job-results-state">Loading active jobs...</div>
            ) : visibleJobs.length === 0 ? (
                <div className="job-results-state">
                    No jobs match this display filter.
                </div>
            ) : (
                <>
                    <section className="job-card-grid">
                        {visibleJobs.map((job) => (
                            <article className={`job-card${job.currentUserApplied ? " job-card-applied" : ""}`} key={job.id}>
                                <div className="job-card-labels">
                                    <div className="job-card-source">{job.source}</div>
                                    {job.currentUserApplied && <span className="applied-mark">✓ Applied</span>}
                                </div>
                                <h2>{job.title}</h2>
                                <p className="job-card-company">{job.company}</p>
                                <div className="job-card-meta">
                                    <span>{job.location}</span>
                                    <span>{formatPostedDate(job.postedAt)}</span>
                                </div>
                                <div className="job-card-tags">
                                    {(job.tags || []).slice(0, 4).map((tag) => (
                                        <span key={tag}>{tag}</span>
                                    ))}
                                </div>
                                {job.applicantCount > 0 && (
                                    <p className="jobpilot-applicant-count">
                                        {job.applicantCount} JobPilot {job.applicantCount === 1 ? "user has" : "users have"} marked this job applied
                                    </p>
                                )}
                                <div className="job-card-actions">
                                    <a
                                        href={job.url}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        View job
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => startAutofill(job)}
                                        disabled={job.currentUserApplied}
                                    >
                                        {job.currentUserApplied ? "Applied" : "Autofill"}
                                    </button>
                                </div>
                                <div className="job-card-secondary-actions">
                                    <button type="button" onClick={() => updatePreference(job, job.currentUserSaved ? "none" : "saved")}>{job.currentUserSaved ? "★ Saved" : "☆ Save"}</button>
                                    <button type="button" onClick={() => updatePreference(job, "blocked")}>Block</button>
                                </div>
                            </article>
                        ))}
                    </section>

                    {hasMore && (
                        <div className="load-more-jobs">
                            <button
                                type="button"
                                onClick={() => loadJobs({
                                    targetPage: page + 1,
                                    append: true,
                                })}
                                disabled={isLoadingMore}
                            >
                                {isLoadingMore
                                    ? "Loading more..."
                                    : "Load 30 more jobs"}
                            </button>
                        </div>
                    )}
                </>
            )}
        </main>
    );
};

export default ActiveJobPostings;
