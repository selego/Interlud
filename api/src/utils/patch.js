const mongoose = require("mongoose");

function getTimeframeDates(timeframe) {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const timeframes = {
    day: () => startOfToday,
    week: () => {
      const date = new Date(startOfToday);
      date.setDate(date.getDate() - 7);
      return date;
    },
    month: () => {
      const date = new Date(startOfToday);
      date.setMonth(date.getMonth() - 1);
      return date;
    },
    year: () => {
      const date = new Date(startOfToday);
      date.setFullYear(date.getFullYear() - 1);
      return date;
    },
  };

  const getStartDate = timeframes[timeframe];
  if (!getStartDate) return { startDate: null, endDate: null };

  return {
    startDate: getStartDate(),
    endDate: new Date(now),
  };
}

async function createFlatPatches(
  document,
  originalDocument,
  user,
  patchModelName,
  isNewDocument = false,
  modifiedPaths = [],
) {
  const PatchModel = mongoose.model(patchModelName);
  const patches = [];
  let virtualUser = null;
  if (user) {
    const { _id, role, name, email, collectivities } = user;
    virtualUser = { _id, role, name, email, collectivities };
  }

  if (isNewDocument) {
    const docObject = document.toObject();
    const paths = Object.keys(docObject).filter(
      (path) => !["_id", "__v", "createdAt", "updatedAt", "_user"].includes(path),
    );

    for (const path of paths) {
      const value = docObject[path];
      if (value === undefined || value === null) continue;
      if (Array.isArray(value) && value.length === 0) continue;

      const patch = new PatchModel({
        ref: document._id,
        path: path,
        op: "add",
        value: value,
        date: new Date(),
        user: virtualUser,
      });
      patches.push(patch);
    }
  } else if (originalDocument && modifiedPaths.length > 0) {
    for (const path of modifiedPaths) {
      const newValue = document.get(path);
      const originalValue = originalDocument[path];

      if (JSON.stringify(newValue) === JSON.stringify(originalValue)) continue;

      let op = "replace";
      if (originalValue === undefined && newValue !== undefined) op = "add";
      if (originalValue !== undefined && newValue === undefined) op = "remove";

      const patch = new PatchModel({
        ref: document._id,
        path: path,
        op: op,
        value: newValue,
        originalValue: originalValue,
        date: new Date(),
        user: virtualUser,
      });

      patches.push(patch);
    }
  }

  if (patches.length > 0) {
    await PatchModel.insertMany(patches);
  }

  return patches;
}

async function saveAndCreatePatches(document, user, patchModelName = null) {
  if (!patchModelName) {
    throw new Error("patchModelName is required");
  }

  const isNewDocument = document.isNew;

  const modifiedPaths = isNewDocument
    ? []
    : document.modifiedPaths().filter((path) => path !== "updatedAt" && path !== "__v" && path !== "_user");

  let originalDocument = null;
  if (!isNewDocument) {
    originalDocument = await document.constructor.findById(document._id).lean();
  }

  if (user) {
    const { _id, role, name, email, collectivities } = user;
    const virtualUser = { _id, role, name, email, collectivities };
    document._user = virtualUser;
  }

  document.updatedAt = new Date();

  await document.save();

  await createFlatPatches(document, originalDocument, user, patchModelName, isNewDocument, modifiedPaths);

  return document;
}

module.exports = { saveAndCreatePatches, createFlatPatches, getTimeframeDates };
