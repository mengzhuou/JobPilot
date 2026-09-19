const asyncHandler = require("express-async-handler");
const repository = require("../repositories/aiAutofillReviewRepository");

const listWaitingForReview = asyncHandler(async (req, res) => {
    res.json({ reviews: await repository.listWaitingForReview(req.auth.userId) });
});
const getReview = asyncHandler(async (req, res) => {
    const review = await repository.findById(req.auth.userId, req.params.id);
    if (!review) return res.status(404).json({ message: "AI review was not found." });
    res.json({ review });
});

module.exports = { listWaitingForReview, getReview };
