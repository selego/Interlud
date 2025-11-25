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

router.post("/webhook", async (req, res) => {
  try {
    // Validation initiale du webhook par Microsoft Graph
    // Docs: https://learn.microsoft.com/fr-fr/graph/change-notifications-delivery-webhooks
    const validationToken = req.query.validationToken;

    if (validationToken) {
      console.log('Validation webhook reçue');
      return res.status(200).send(validationToken);
    }
    
    // Afficher toutes les données de la notification
    console.log('=== WEBHOOK NOTIFICATION ===');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('===========================');
    
    return res.status(202).send();
  } catch (error) {
    console.error("Error webhook:", error);
    res.status(500).send();
  }
});
module.exports = router;
