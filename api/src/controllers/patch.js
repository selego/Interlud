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

module.exports = { get };