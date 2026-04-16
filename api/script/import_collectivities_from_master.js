const { graphFetch } = require("../src/services/microsoftGraph");
const Collectivity = require("../src/models/collectivity");
const mongoose = require("mongoose");
const config = require("../src/config");

const sharePointSiteName = "selegobv";
const masterFileId = "01IBL4ADNZP32VURAL2ZFZJYXPPUMULGLC";
const worksheetName = "Données EPCI";

async function getWorksheetUsedRange(fileId, sheetName) {
  const siteId = (await graphFetch(`/sites/${sharePointSiteName}.sharepoint.com`)).id;
  return graphFetch(`/sites/${siteId}/drive/items/${fileId}/workbook/worksheets/${encodeURIComponent(sheetName)}/usedRange`);
}

async function importCollectivities() {
  await mongoose.connect(config.MONGODB_ENDPOINT);
  console.log("Connected to MongoDB");

  const data = await getWorksheetUsedRange(masterFileId, worksheetName);

  // Find the header row (the one containing "libgeo")
  let headerRowIndex = data.values.findIndex((row) => row.some((cell) => /libgeo/i.test(String(cell))));
  if (headerRowIndex === -1) {
    console.error("Header row not found (looking for 'libgeo')");
    process.exit(1);
  }
  console.log(`Header row found at index ${headerRowIndex}`);

  const headers = data.values[headerRowIndex];
  const rows = data.values.slice(headerRowIndex + 1);

  // Find column indices from headers
  const colIndex = {
    name: headers.findIndex((h) => /libgeo/i.test(h)),
    siren: headers.findIndex((h) => /codgeo/i.test(h)),
    department: headers.findIndex((h) => /num.*dpt/i.test(h)),
    year: headers.findIndex((h) => /^an$/i.test(h)),
    area: headers.findIndex((h) => /superf/i.test(h)),
  };

  console.log("Column mapping:", Object.fromEntries(Object.entries(colIndex).map(([k, v]) => [k, `${k} -> col ${v} (${headers[v]})`])));

  // Check all columns found
  for (const [field, idx] of Object.entries(colIndex)) {
    if (idx === -1) {
      console.error(`Column not found for field: ${field}`);
      process.exit(1);
    }
  }

  console.log(`Found ${rows.length} rows to process`);

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = row[colIndex.name];
    if (!name) continue;

    const collectivityData = {
      name: String(name).trim(),
      siren: Number(row[colIndex.siren]),
      department: String(row[colIndex.department]).trim(),
      year: Number(row[colIndex.year]),
      area: Number(row[colIndex.area]),
    };

    const existing = await Collectivity.findOne({ $or: [{ siren: collectivityData.siren }, { name: collectivityData.name }] });
    if (existing) {
      console.log(`Skipped (already exists): ${collectivityData.name}`);
      skipped++;
      continue;
    }

    await Collectivity.create(collectivityData);
    console.log(`Created: ${collectivityData.name}`);
    created++;
  }

  console.log(`Import complete: ${created} created, ${skipped} skipped (already existed)`);
  await mongoose.disconnect();
}

if (require.main === module) {
  importCollectivities()
    .then(() => {
      console.log("Done");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error:", err);
      process.exit(1);
    });
}

module.exports = { importCollectivities };
