const mongoose = require("mongoose");

const MODELNAME = "action_indicator_value";

const Schema = new mongoose.Schema(
  {
    action_id: { type: String, trim: true },
    indicator_id_value: { type: String, trim: true },
  },
  { timestamps: true },
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
