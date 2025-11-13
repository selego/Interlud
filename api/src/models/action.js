const mongoose = require("mongoose");

const MODELNAME = "action";

const Schema = new mongoose.Schema(
  {
    type: { type: String, enum: ["custom", "reference", "global"], trim: true },
    excel_sheet_id: { type: String, trim: true },
    excel_sheet_name: { type: String, trim: true },
    
    action_parent_id: { type: String, trim: true },
    action_parent_name: { type: String, trim: true },
    name: { type: String, trim: true },
    collectivity_id: { type: String, trim: true },
    collectivity_name: { type: String, trim: true },
    description: { type: String, trim: true },
    status: {
      type: String,
      enum: ["upcoming", "in_progress", "blocked", "completed", "no_status"],
      default: "no_status",
      trim: true,
    },
    blocked_reason: { type: String, trim: true },
    step_description: { type: String, trim: true },
    date_start: { type: Date, trim: true },
    date_end: { type: Date, trim: true },
    budget_costs: { type: Number, trim: true },
    budget_description: { type: String, trim: true },
    financial_aid: { type: Number, trim: true },
    financial_aid_description: { type: String, trim: true },
    pilote: { type: String, enum: ["epci", "acteur_economique"], trim: true },
    pilote_description: { type: String, trim: true },
    partners: { type: String, enum: ["epci", "acteur_economique"], trim: true },
    partners_description: { type: String, trim: true },
    priority: { type: String, enum: ["high", "medium", "low"], trim: true },
    is_subsidized_by_program: { type: Boolean, default: false },
    related_initiatives: { type: String, trim: true },
    comment: { type: String, trim: true },
    completeness: { type: Number, default: 0 },
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
        type: { type: String, enum: ["text", "number", "date"], trim: true },
        value: { type: String, trim: true },
      },
    ],
  },
  { timestamps: true },
);

Schema.set("toObject", { virtuals: true });
Schema.set("toJSON", { virtuals: true });

Schema.virtual("patches", {
  ref: "actionPatch",
  localField: "_id",
  foreignField: "ref",
});

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
