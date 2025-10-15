const mongoose = require("mongoose");

const MODELNAME = "indicator";

const Schema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    description: { type: String, trim: true },
    value_unit: { type: String, trim: true },
    value_type: { type: String, trim: true },
    category: { type: String, trim: true },
    sub_category: { type: String, trim: true },
  },
  { timestamps: true },
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
