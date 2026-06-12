const mongoose = require('mongoose');

const MODELNAME = 'indicator';

const type = {
  text: { type: String, trim: true },
  number: { type: Number, trim: true },
  radio: { type: String, trim: true },
  checkbox: { type: Array, default: [] },
};

const leafCondition = {
  type: { type: String, enum: ['equals', 'contains', 'greaterThan', 'lessThan', 'greaterOrEqual', 'lessOrEqual', 'notEmpty', 'isEmpty', 'neverVisible'] },
  excel_indicator_id: { type: String },
  excel_indicator_situation: { type: String, enum: ['init', 'ref', 'prev', 'expost'] },
  value: { type: mongoose.Schema.Types.Mixed },
  negate: { type: Boolean, default: false },
};

const conditionNode = { ...leafCondition, operator: { type: String, enum: ['AND', 'OR'] }, conditions: [leafCondition] };

const displayConditionForSituation = { operator: { type: String, enum: ['AND', 'OR'] }, conditions: [conditionNode] };

const Schema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    description: { type: String, trim: true },
    value_unit: { type: String, trim: true },
    value_type: { type: String, enum: ['number', 'text', 'radio', 'checkbox'], trim: true },
    excel_indicator_id: { type: String, trim: true },
    value_possibilities: { type: Array, default: [] },
    value_possibilities_source: {
      init: {
        excel_indicator_id: { type: String },
        situation: { type: String, enum: ['init', 'ref', 'prev', 'expost'] },
      },
      ref: {
        excel_indicator_id: { type: String },
        situation: { type: String, enum: ['init', 'ref', 'prev', 'expost'] },
      },
      prev: {
        excel_indicator_id: { type: String },
        situation: { type: String, enum: ['init', 'ref', 'prev', 'expost'] },
      },
      expost: {
        excel_indicator_id: { type: String },
        situation: { type: String, enum: ['init', 'ref', 'prev', 'expost'] },
      },
    },
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
    is_primordial: { type: Boolean, default: false },
    presence_in_excel: {
      init: { type: Boolean, default: false },
      ref: { type: Boolean, default: false },
      prev: { type: Boolean, default: false },
      expost: { type: Boolean, default: false },
    },
    excel_line_number: {
      init: { type: Number },
      ref: { type: Number },
      prev: { type: Number },
      expost: { type: Number },
    },
    display_condition: {
      init: displayConditionForSituation,
      ref: displayConditionForSituation,
      prev: displayConditionForSituation,
      expost: displayConditionForSituation,
    },
  },
  { timestamps: true },
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
