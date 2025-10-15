const mongoose = require("mongoose");

const MODELNAME = "action";

const Schema = new mongoose.Schema(
  {
    type : { type: String, enum: ["custom", "master"], trim: true },
    master_reference_id: { type: String, trim: true, required: true },
    name: { type: String, trim: true, required: true },
    collectivity_id: { type: String, trim: true },
    collectivity_name: { type: String, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ["upcoming", "in_progress", "blocked", "completed", "no_status"], default: "no_status", trim: true, required: true },
    blocked_reason: { type: String, trim: true },
    step_description: { type: String, trim: true },
    date_start: { type: Date, trim: true },
    date_end: { type: Date, trim: true },
    costs: { type: String, trim: true },
    financial_aid: { type: String, trim: true },
    pilote: { type: String, enum: ["epci", "acteur_economique"], trim: true, required: true },
    pilote_description: { type: String, trim: true },
    partners: { type: String, enum: ["epci", "acteur_economique"], trim: true },
    partners_description: { type: String, trim: true },
    priority: { type: String, enum: ["high", "medium", "low"], trim: true },
    subsidized_by_program: { type: Boolean, default: false, required: true },
    related_initiatives: { type: String, trim: true },
    comment: { type: String, trim: true },
    attached_documents: [{
      filename: { type: String, required: true },
      original_name: { type: String, required: true },
      file_type: { type: String },
      mime_type: { type: String },
      size: { type: Number },
      url: { type: String, required: true },
      uploaded_at: { type: Date, default: Date.now }
    }],
    custom_fields: [{
        name: { type: String, required: true },
        type: { type: String, enum: ["text", "number", "date"], required: true },
        value: { type: String, required: true }
      }],
  },
  { timestamps: true },
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
