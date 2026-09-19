const { Country, State, City } = require('country-state-city');
const zipcodes = require('zipcodes');
const normalize = value => String(value || '').trim().toLowerCase();
const countries = Country.getAllCountries();
const states = State.getAllStates();
const allCities = City.getAllCities();
const countryNames = new Map(countries.map(c => [c.isoCode, c.name]));
const stateNames = new Map(states.map(s => [`${s.countryCode}:${s.isoCode}`, s.name]));

function locationOptions({ kind, q = '', country = '', state = '', city = '' }) {
    const nation = countries.find(c => [normalize(c.name), normalize(c.isoCode)].includes(normalize(country)));
    const region = nation && states.find(s => s.countryCode === nation.isoCode && [normalize(s.name), normalize(s.isoCode)].includes(normalize(state)));
    const needle = normalize(q);
    if (kind === 'countries') return countries.filter(c => !needle || normalize(c.name).includes(needle) || normalize(c.isoCode) === needle).map(c => c.name);
    if (kind === 'states') return nation ? State.getStatesOfCountry(nation.isoCode).filter(s => !needle || normalize(s.name).includes(needle) || normalize(s.isoCode).startsWith(needle)).map(s => s.name) : [];
    if (kind === 'postal') {
        if (nation?.isoCode !== 'US' || !region || !city) return [];
        return [...new Set(zipcodes.lookupByName(city, region.isoCode).filter(item => normalize(item.city) === normalize(city)).map(item => item.zip))].sort();
    }
    if (!['cities', 'locations'].includes(kind) || needle.length < 2) return [];
    if (kind === 'cities' && (!nation || !region)) return [];
    const items = kind === 'cities' ? City.getCitiesOfState(nation.isoCode, region.isoCode) : allCities;
    const matches = [];
    for (const item of items) {
        const label = kind === 'cities' ? item.name : `${item.name}, ${item.stateCode}, ${countryNames.get(item.countryCode)}`;
        const searchable = normalize(`${label} ${stateNames.get(`${item.countryCode}:${item.stateCode}`) || ''}`);
        if (needle.split(/[\s,]+/).filter(Boolean).every(term => searchable.includes(term))) matches.push(label);
        if (matches.length === 40) break;
    }
    return [...new Set(matches)];
}
module.exports = { locationOptions };
