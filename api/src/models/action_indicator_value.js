const mongoose = require("mongoose");

const MODELNAME = "action_indicator_value";

const Schema = new mongoose.Schema(
  {
    action_id: { type: String, trim: true },
    collectivity_id: { type: String, trim: true },
    indicator_id: { type: String, trim: true },
    situation: { type: String, enum: ["init", "ref", "prev", "expost"], trim: true },
    year: { type: Number, trim: true },
    value: { type: Number, trim: true },
    source: { type: String, trim: true },
    comment: { type: String, trim: true },
  },
  { timestamps: true },
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
