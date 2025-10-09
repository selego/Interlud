const mongoose = require("mongoose");

const MODELNAME = "indicator_value";

const Schema = new mongoose.Schema(
  {
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
