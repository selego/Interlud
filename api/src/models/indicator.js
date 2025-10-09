const mongoose = require("mongoose");

const MODELNAME = "indicator";

const Schema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    description: { type: String, trim: true },
    value: { type: Number, trim: true },
    unit: { type: String, trim: true },
    type: { type: String, trim: true }, // pas sure d'avoir compris le type
  },
  { timestamps: true },
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
