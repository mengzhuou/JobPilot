const express = require("express");
const multer = require("multer");
const requireAuth = require("../middleware/requireAuth");
const controller = require("../controllers/resumeController");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const router = express.Router();

router.use(requireAuth);
router.get("/", controller.list);
router.post("/", upload.single("file"), controller.create);
router.patch("/:id", controller.update);
router.post("/:id/primary", controller.makePrimary);
router.get("/:id/download", controller.download);
router.delete("/:id", controller.remove);

router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "Résumé files must be 10 MB or smaller." });
    }
    return next(error);
});

module.exports = router;
