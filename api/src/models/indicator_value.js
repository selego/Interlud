const mongoose = require("mongoose");

const MODELNAME = "indicator_value";

const Schema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    action_id: { type: String, trim: true },
    action_name: { type: String, trim: true },
    collectivity_id: { type: String, trim: true },
    collectivity_name: { type: String, trim: true },
    indicator_id: { type: String, trim: true },
    indicator_name: { type: String, trim: true },
    indicator_type: { type: String, enum: ["number", "text", "radio", "checkbox"], trim: true },
    indicator_value_possibilities: { type: Array, default: [] },
    indicator_category_id: { type: String, trim: true },
    indicator_category_name: { type: String, trim: true },
    indicator_sub_category_id: { type: String, trim: true },
    indicator_sub_category_name: { type: String, trim: true },
    situation: { type: String, enum: ["init", "ref", "prev", "expost"], trim: true },
    year: { type: Number, trim: true },
    source: { type: String, trim: true },
    comment: { type: String, trim: true },

    value: {  
      text: { type: String, trim: true },
      number: { type: Number, trim: true },
      radio: { type: Array, default: [] },
      checkbox: { type: Array, default: [] }
    },


    value_default: {   
      text: { type: String, trim: true },
      number: { type: Number, trim: true },
      radio: { type: Array, default: [] },
      checkbox: { type: Array, default: [] }
    },
  },
  { timestamps: true },
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
