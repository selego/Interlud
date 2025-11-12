const ERROR_CODES = require("../utils/errorCodes");
const { capture } = require("../services/sentry");

const get = async (req, model) => {
  try {
    if (!req.params?.id) {
      throw new Error(ERROR_CODES.INVALID_BODY);
    }

    const elem = await model.findById(req.params.id);
    if (!elem) {
      throw new Error(ERROR_CODES.NOT_FOUND);
    }

    const data = await elem.patches.find({ ref: elem.id }).sort("-date").lean();
    //sometime we create an object with a field null, we don't want to send it
    data.forEach((patch) => {
      patch.ops = patch.ops.filter((op) => {
        const isAddOperation = op.op === "add";
        const hasValue = op.value !== null && op.value !== undefined && op.value !== "";
        const isNotEmptyArray = !Array.isArray(op.value) || op.value.length > 0;
        return !(isAddOperation && (!hasValue || !isNotEmptyArray));
      });
    });
    return data;
  } catch (error) {
    capture(error);
    throw error;
  }
};

const getIndicatorPatchesForAction = async (actionId, IndicatorValue) => {
  try {
    if (!actionId) {
      throw new Error(ERROR_CODES.INVALID_BODY);
    }

    const indicatorValues = await IndicatorValue.find({ action_id: actionId });
    
    if (!indicatorValues || indicatorValues.length === 0) {
      return [];
    }

    const allPatches = await Promise.all(
      indicatorValues.map(async (indicatorValue) => {
        const patches = await indicatorValue.patches.find({ ref: indicatorValue.id }).sort("-date").lean();
        
        patches.forEach((patch) => {
          patch.ops = patch.ops.filter((op) => {
            const isAddOperation = op.op === "add";
            const hasValue = op.value !== null && op.value !== undefined && op.value !== "";
            const isNotEmptyArray = !Array.isArray(op.value) || op.value.length > 0;
            return !(isAddOperation && (!hasValue || !isNotEmptyArray));
          });
        });

        return patches.map((patch) => ({
          ...patch,
          indicator_value_id: indicatorValue._id.toString(),
          indicator_id: indicatorValue.indicator_id,
          indicator_name: indicatorValue.indicator_name,
          situation: indicatorValue.situation,
          year: indicatorValue.year,
        }));
      })
    );

    const flattenedPatches = allPatches.flat().sort((a, b) => new Date(b.date) - new Date(a.date));

    return flattenedPatches;
  } catch (error) {
    capture(error);
    throw error;
  }
};

const search = async ({ documentId, model, field_path, limit, offset }) => {
  try {
    if (!documentId) {
      throw new Error(ERROR_CODES.INVALID_BODY);
    }

    const elem = await model.findById(documentId);
    if (!elem) {
      throw new Error(ERROR_CODES.NOT_FOUND);
    }

    let patches = await elem.patches.find({ ref: elem.id }).sort("-date").lean();
    
    patches.forEach((patch) => {
      patch.ops = patch.ops.filter((op) => {
        const isAddOperation = op.op === "add";
        const hasValue = op.value !== null && op.value !== undefined && op.value !== "";
        const isNotEmptyArray = !Array.isArray(op.value) || op.value.length > 0;
        return !(isAddOperation && (!hasValue || !isNotEmptyArray));
      });
    });

    if (field_path) {
      patches = patches.filter((patch) => 
        patch.ops && patch.ops.some(op => op.path === field_path)
      );
    }

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

module.exports = { get, getIndicatorPatchesForAction, search };