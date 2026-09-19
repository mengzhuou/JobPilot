const express = require("express");
const {
    createCareerSource,
    getCareerSourceDiscovery,
    listCareerSources,
    listActiveJobPostings,
    getActiveJobPosting,
    previewCareerSource,
} = require("../controllers/jobPostingController");

const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const requireAdmin = require("../middleware/requireAdmin");

router.use(requireAuth);
router.get("/", listActiveJobPostings);
router.get("/detail/:jobId", getActiveJobPosting);
router.get('/platforms', async (req, res, next) => {
    try {
        const sources = [...require('../services/companyCareerSources'), ...await require('../repositories/customCareerSourceRepository').listCustomCareerSources()];
        const names = { ashby:'Ashby', greenhouse:'Greenhouse', lever:'Lever', google:'Google Careers', generic:'Company career page', 'oracle-uber':'Oracle', eightfold:'Eightfold' };
        const platforms = new Set(sources.map(source => names[source.provider] || source.provider).filter(Boolean));
        if (sources.some(source => /linkedin\.com/i.test(source.careerUrl || ''))) platforms.add('LinkedIn');
        res.json({ platforms: [...platforms].sort() });
    } catch (error) { next(error); }
});
router.get("/sources", requireAdmin, listCareerSources);
router.post("/sources", requireAdmin, createCareerSource);
router.post("/sources/preview", requireAdmin, previewCareerSource);
router.get("/sources/discovery/:id", requireAdmin, getCareerSourceDiscovery);

module.exports = router;
