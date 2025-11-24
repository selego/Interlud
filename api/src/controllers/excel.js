const express = require("express");
const router = express.Router();
const { getSharePointExcelFiles, readExcelCells, updateExcelCell } = require("../services/microsoftGraph");

router.get("/sharepoint", async (req, res) => {
  try {
    const result = await getSharePointExcelFiles();
    console.log('result', result);
    res.json({ ok: true, data: result });
  } catch (error) {
    console.error("Error:", error);
    res.json({ ok: false, data: { error: error.message } });
  }
});

router.get("/cells/:fileId", async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const { worksheetName, range } = req.query;
    const result = await readExcelCells(fileId, worksheetName, range);
    res.json({ ok: true, data: result });
  } catch (error) {
    console.error("Error:", error);
    res.json({ ok: false, data: { error: error.message } });
  }
});

router.post("/cell/:fileId", async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const { sheet, cell, value } = req.body;
    const result = await updateExcelCell(fileId, sheet, cell, value);
    res.json({ ok: true, data: result });
  } catch (error) {
    console.error("Error:", error);
    res.json({ ok: false, data: { error: error.message } });
  }
});

module.exports = router;
