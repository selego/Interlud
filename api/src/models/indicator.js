const mongoose = require("mongoose");

const MODELNAME = "indicator";

const Schema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    description: { type: String, trim: true },
    value_unit: { type: String, trim: true },
    value_type: { type: String, enum: ["number", "text", "radio", "checkbox"], trim: true },
    value_name: { type: String, trim: true },
    default_value: { type: String, trim: true },
    value_possibilities: { type: Array, default: [] },
    indicator_category_id: { type: String, trim: true },
    indicator_category_name: { type: String, trim: true },
    indicator_sub_category_id: { type: String, trim: true },
    indicator_sub_category_name: { type: String, trim: true },
    action_id : { type: String, trim: true },
    action_name : { type: String, trim: true },
  },
  { timestamps: true },
)

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
