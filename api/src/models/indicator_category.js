const mongoose = require("mongoose");

const MODELNAME = "indicator_category";

const Schema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    description: { type: String, trim: true },
    type : { type: String, enum: ["principal", "sub"], trim: true },
    principal_category_id: { type: String, trim: true },
    principal_category_name: { type: String, trim: true },
    indicator_id: { type: String, trim: true },
    indicator_name: { type: String, trim: true },
  },
  { timestamps: true },
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
