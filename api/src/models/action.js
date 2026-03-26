const mongoose = require('mongoose');

const MODELNAME = 'action';

const Schema = new mongoose.Schema(
  {
    type: { type: String, enum: ['custom', 'reference', 'global', 'config'], trim: true },
    excel_worksheetname: { type: String, trim: true },

    exel_files_prev: [{ year_prev: { type: Number, trim: true }, year_ref: { type: Number, trim: true }, excel_file_id: { type: String, trim: true } }],
    excel_files_expost: [{ year_expost: { type: Number, trim: true }, year_ref: { type: Number, trim: true }, excel_file_id: { type: String, trim: true } }],
    year_init: { type: Number, trim: true },
    year_ref: { type: Number, trim: true },
    year_prev: { type: Number, trim: true },
    year_expost: { type: Number, trim: true },

    instance_number: { type: Number, default: 1 },

    action_parent_id: { type: String, trim: true },
    action_parent_name: { type: String, trim: true },
    name: { type: String, trim: true },
    description: { type: String, trim: true },
    status: {
      type: String,
      enum: ['upcoming', 'in_progress', 'blocked', 'completed', 'no_status'],
      default: 'no_status',
      trim: true,
    },
    owner: {
      type: String,
      enum: ['collectivity', 'economic_actor'],
      default: 'collectivity',
      trim: true,
    },

    collectivity_id: { type: String, trim: true },
    collectivity_name: { type: String, trim: true },

    action_collectivity_id: { type: String, trim: true },
    economic_actor_id: { type: String, trim: true },
    economic_actor_name: { type: String, trim: true },

    blocked_reason: { type: String, trim: true },
    step_description: { type: String, trim: true },
    date_start: { type: Date, trim: true },
    date_end: { type: Date, trim: true },
    budget_costs: { type: Number, trim: true },
    budget_description: { type: String, trim: true },
    financial_aid: { type: Number, trim: true },
    financial_aid_description: { type: String, trim: true },
    pilote: { type: String, enum: ['epci', 'acteur_economique', 'autres'], trim: true },
    pilote_description: { type: String, trim: true },
    partners: { type: String, enum: ['epci', 'acteur_economique', 'autres'], trim: true },
    partners_description: { type: String, trim: true },
    priority: { type: String, enum: ['high', 'medium', 'low'], trim: true },
    is_subsidized_by_program: { type: Boolean, default: false },
    related_initiatives: { type: String, trim: true },
    comment: { type: String, trim: true },
    attached_documents: [
      {
        filename: { type: String, trim: true },
        original_name: { type: String, trim: true },
        file_type: { type: String },
        mime_type: { type: String },
        size: { type: Number },
        url: { type: String, trim: true },
        uploaded_at: { type: Date, default: Date.now },
      },
    ],
    custom_fields: [
      {
        name: { type: String, trim: true },
        type: { type: String, enum: ['text', 'number', 'date'], trim: true },
        value: { type: String, trim: true },
      },
    ],
    last_modif_by_id: { type: String, trim: true },
    last_modif_by_name: { type: String, trim: true },
    last_modif_by_email: { type: String, trim: true },
    last_modif_date: { type: Date, default: Date.now },

    completion_init: { type: Number, default: 0 },
    completion_ref: { type: Number, default: 0 },
    completion_prev: { type: Number, default: 0 },
    completion_expost: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
