const mongoose = require('mongoose');

const MODELNAME = 'indicator_value';

const Schema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    action_id: { type: String, trim: true },
    action_name: { type: String, trim: true },
    collectivity_id: { type: String, trim: true },
    collectivity_name: { type: String, trim: true },

    owner: {
      type: String,
      enum: ['collectivity', 'economic_actor'],
      default: 'collectivity',
      trim: true,
    },

    indicator_value_collectivity_id: { type: String, trim: true },
    economic_actor_id: { type: String, trim: true },
    economic_actor_name: { type: String, trim: true },
    indicator_id: { type: String, trim: true },
    indicator_name: { type: String, trim: true },
    indicator_type: { type: String, enum: ['number', 'text', 'radio', 'checkbox'], trim: true },
    indicator_value_possibilities: { type: Array, default: [] },
    indicator_category_id: { type: String, trim: true },
    indicator_category_name: { type: String, trim: true },
    indicator_sub_category_id: { type: String, trim: true },
    indicator_sub_category_name: { type: String, trim: true },
    indicator_value_unit: { type: String, trim: true },
    indicator_excel_id: { type: String, trim: true },
    is_primordial: { type: Boolean, default: false },
    excel_line_number: { type: Number, trim: true },
    display_condition: {
      operator: { type: String, enum: ['AND', 'OR'] },
      conditions: [
        {
          type: { type: String, enum: ['equals', 'contains', 'greaterThan', 'lessThan', 'greaterOrEqual', 'lessOrEqual', 'notEmpty', 'isEmpty'] },
          excel_indicator_id: { type: String },
          excel_indicator_situation: { type: String, enum: ['init', 'ref', 'prev', 'expost'] },
          value: { type: mongoose.Schema.Types.Mixed },
          negate: { type: Boolean, default: false },
        },
      ],
    },
    situation: { type: String, enum: ['init', 'ref', 'prev', 'expost'], trim: true },
    year: { type: Number, trim: true },
    value_source: { type: String, trim: true },
    comment: { type: String, trim: true },
    value: {
      text: { type: String, trim: true },
      number: { type: Number, trim: true },
      radio: { type: String, trim: true },
      checkbox: { type: Array, default: [] },
    },
    value_default: {
      text: { type: String, trim: true },
      number: { type: Number, trim: true },
      radio: { type: String, trim: true },
      checkbox: { type: Array, default: [] },
    },
  },
  { timestamps: true },
);

Schema.index({ indicator_id: 1, situation: 1 });
Schema.index({ collectivity_id: 1, situation: 1 });
Schema.index({ action_id: 1, situation: 1, year: 1 });
Schema.index({ action_id: 1, excel_line_number: 1 });
Schema.index({ owner: 1, action_id: 1 });
Schema.index({ collectivity_id: 1, indicator_excel_id: 1, situation: 1, year: 1 });

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
