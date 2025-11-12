const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");

const search = async ({ documentIds, model, field_path, limit, offset }) => {
  try {
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      throw new Error(ERROR_CODES.INVALID_BODY);
    }

    const documents = await model.find({ _id: { $in: documentIds } });
    
    if (!documents || documents.length === 0) {
      throw new Error(ERROR_CODES.NOT_FOUND);
    }

    const allPatches = await Promise.all(
      documents.map(async (doc) => {
        const patches = await doc.patches.find({ ref: doc.id }).sort("-date").lean();
        
        patches.forEach((patch) => {
          patch.ops = patch.ops.filter((op) => {
            const isAddOperation = op.op === "add";
            const hasValue = op.value !== null && op.value !== undefined && op.value !== "";
            const isNotEmptyArray = !Array.isArray(op.value) || op.value.length > 0;
            return !(isAddOperation && (!hasValue || !isNotEmptyArray));
          });
        });

        return patches;
      })
    );

    let patches = allPatches.flat();

    if (field_path) {
      patches = patches.filter((patch) => 
        patch.ops && patch.ops.some(op => op.path === field_path)
      );
    }

    patches.sort((a, b) => new Date(b.date) - new Date(a.date));

    const total = patches.length;

    const skip = offset || 0;
    const limitValue = limit || 50;
    const paginatedPatches = patches.slice(skip, skip + limitValue);

    return {
      data: paginatedPatches,
      total,
    };
  } catch (error) {
    capture(error);
    throw error;
  }
};

module.exports = { search };