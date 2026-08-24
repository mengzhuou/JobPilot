// applicationAgent.js

const { chromium } = require("playwright");

const startApplicationAgent = async (jobUrl) => {

    console.log("Starting JobPilot...");
    console.log(`Opening: ${jobUrl}`);

    const browser = await chromium.launch({
        headless: false,
        slowMo: 300
    });

    const page = await browser.newPage();

    await page.goto(jobUrl);

    console.log("Job application opened");
};

module.exports = {
    startApplicationAgent
};