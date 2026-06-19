require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");
const { graphFetch } = require("../src/services/microsoftGraph");

const sharePointSiteName = "selegobv";
const masterFileId = "01IBL4ADOONRWPY52GIBALOID2KT5FHIB3"; // V24

const WORKSHEETS = [
  { name: "Remplissage - Sit. Init.", situation: "init" },
  { name: "Remplissage - Sit. Ref.", situation: "ref" },
  { name: "Remplissage - Sit. Prev.", situation: "prev" },
  { name: "Remplissage - Sit. Expost", situation: "expost" },
];

// Échappe un champ CSV (guillemets doublés, le tout entre guillemets)
const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

(async () => {
  const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;

  const lines = ["situation,feuille,excel_indicator_id,nb_occurrences,actions,lignes,multi_actions"];
  let totalDup = 0;

  for (const { name, situation } of WORKSHEETS) {
    const data = await graphFetch(`/sites/${siteId}/drive/items/${masterFileId}/workbook/worksheets/${encodeURIComponent(name)}/usedRange`);
    const startRow = data.address?.match(/[A-Z]+(\d+):/i) ? parseInt(data.address.match(/[A-Z]+(\d+):/i)[1], 10) : 1;
    const rows = data.values.slice(1);

    // Regrouper les numéros de ligne (Excel) par excel_indicator_id (colonne E, index 4)
    const byId = new Map();
    for (let i = 0; i < rows.length; i++) {
      const id = String(rows[i][4] ?? "").trim();
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push({ ligne: startRow + 1 + i, action: rows[i][12] });
    }

    // Tous les doublons de la feuille, peu importe l'action
    const dups = [...byId.entries()].filter(([, occ]) => occ.length > 1);
    for (const [id, occ] of dups) {
      const actions = [...new Set(occ.map((o) => String(o.action || "—")))];
      lines.push([
        csv(situation),
        csv(name),
        csv(id),
        csv(occ.length),
        csv(actions.join(" | ")),
        csv(occ.map((o) => o.ligne).join(" | ")),
        csv(actions.length > 1 ? "OUI" : "non"),
      ].join(","));
    }
    totalDup += dups.length;
    console.log(`[${situation}] ${dups.length} doublon(s)`);
  }

  const outPath = path.resolve(__dirname, "doublons_indicateurs.csv");
  fs.writeFileSync(outPath, "﻿" + lines.join("\n"), "utf8"); // BOM pour Excel
  console.log(`\n=== ${totalDup} doublons écrits dans ${outPath} ===`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
