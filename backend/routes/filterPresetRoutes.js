const router = require('express').Router();
const { pool } = require('../config/postgres');
const requireAuth = require('../middleware/requireAuth');
const arrayKeys = ['includeCompanies', 'excludeCompanies', 'requiredSkills', 'excludeFocuses', 'excludeEligibility', 'excludeJobTypes', 'locations', 'excludeLevels', 'includeLevels', 'excludePlatforms'];

function validateFilters(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid filters');
    const filters = {};
    for (const key of arrayKeys) {
        const values = input[key] ?? [];
        if (!Array.isArray(values) || values.length > 100 || values.some(value => typeof value !== 'string' || value.length > 199)) throw new Error(`Invalid ${key}`);
        filters[key] = [...new Set(values.map(value => value.trim()).filter(Boolean))];
    }
    if (typeof input.remoteOnly !== 'boolean') throw new Error('Invalid remote filter');
    if (!['all','day','week','month','three_months','six_months'].includes(input.postedWithin)) throw new Error('Invalid posting date');
    filters.remoteOnly = input.remoteOnly;
    filters.postedWithin = input.postedWithin;
    return filters;
}

router.use(requireAuth);
router.get('/', async (req, res, next) => {
    try {
        const result = await pool.query('SELECT id,name,filters FROM jobpilot.filter_presets WHERE user_id=$1 ORDER BY lower(name),id', [req.auth.userId]);
        res.json({ presets: result.rows });
    } catch (error) { next(error); }
});
router.post('/', async (req, res, next) => {
    let filters;
    const name = typeof req.body.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
    try {
        if (!name || name.length > 199) throw new Error('Enter a preference name under 200 characters.');
        filters = validateFilters(req.body.filters);
    } catch (error) { return res.status(400).json({ message: error.message }); }
    try {
        const result = await pool.query('INSERT INTO jobpilot.filter_presets(user_id,name,filters) VALUES($1,$2,$3::jsonb) RETURNING id,name,filters', [req.auth.userId, name, JSON.stringify(filters)]);
        res.status(201).json({ preset: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ message: 'You already have a preference with this name. Choose another name.' });
        next(error);
    }
});
module.exports = router;
