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
      // Microsoft Graph envoie un validationToken lors de la création de l'abonnement
      // Il faut répondre avec ce token en texte brut (pas JSON) et status 200
      console.log('Validation webhook reçue');
      return res.status(200).send(validationToken);
    }
    
    // Vérification du clientState pour sécuriser les notifications
    const notifications = req.body.value;
    console.log('notifications', notifications);
    if (notifications && notifications.length > 0) {
      for (const notification of notifications) {
        console.log('Notification reçue:', {
          subscriptionId: notification.subscriptionId,
          changeType: notification.changeType,
          resource: notification.resource,
          clientState: notification.clientState
        });
        
        // Vérifier que le clientState correspond à celui défini lors de la création
        if (notification.clientState !== "secretClientValue") {
          console.warn('clientState invalide, notification ignorée');
          continue;
        }
        
        // TODO: Traiter la notification de changement Excel ici
        // Par exemple: lire le fichier Excel modifié, mettre à jour la base de données, etc.
      }
    }
    
    // Répondre rapidement (< 3 secondes) pour éviter les retry de Microsoft Graph
    res.status(202).send();
  } catch (error) {
    console.error("Error webhook:", error);
    res.status(500).send();
  }
});
module.exports = router;
