const mongoose = require('mongoose');

const MODELNAME = 'indicator';

const type = {
  text: { type: String, trim: true },
  number: { type: Number, trim: true },
  radio: { type: String, trim: true },
  checkbox: { type: Array, default: [] },
};

const Schema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    description: { type: String, trim: true },
    value_unit: { type: String, trim: true },
    value_type: { type: String, enum: ['number', 'text', 'radio', 'checkbox'], trim: true },
    excel_indicator_id: { type: String, trim: true },
    value_possibilities: { type: Array, default: [] },
    value_default: {
      init: { type: type, trim: true },
      ref: { type: type, trim: true },
      prev: { type: type, trim: true },
      expost: { type: type, trim: true },
    },
    indicator_category_id: { type: String, trim: true },
    indicator_category_name: { type: String, trim: true },
    indicator_sub_category_id: { type: String, trim: true },
    indicator_sub_category_name: { type: String, trim: true },
    linked_action_id: { type: String, trim: true },
    linked_action_name: { type: String, trim: true },
    presence_in_excel: {
      init: { type: Boolean, default: false },
      ref: { type: Boolean, default: false },
      prev: { type: Boolean, default: false },
      expost: { type: Boolean, default: false },
    },
    display_indicator_excel_id: { type: String, trim: true },
    display_condition_indicator_value: { type: String, trim: true },
  },
  { timestamps: true }
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
