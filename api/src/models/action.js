const mongoose = require("mongoose");
const { getVirtualUser } = require("../utils/patch");
const patchHistory = require("mongoose-patch-history").default;

const MODELNAME = "action";

const Schema = new mongoose.Schema(
  {
    type : { type: String, enum: ["custom", "reference"], trim: true },
    action_reference_id: { type: String, trim: true },
    action_reference_name: { type: String, trim: true },
    name: { type: String, trim: true },
    collectivity_id: { type: String, trim: true },
    collectivity_name: { type: String, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ["upcoming", "in_progress", "blocked", "completed", "no_status"], default: "no_status", trim: true },
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
    attached_documents: [{
      filename: { type: String, trim: true },
      original_name: { type: String, trim: true },
      file_type: { type: String },
      mime_type: { type: String },
      size: { type: Number },
      url: { type: String, trim: true },
      uploaded_at: { type: Date, default: Date.now }
    }],
    custom_fields: [{
        name: { type: String, trim: true },
        type: { type: String, enum: ["text", "number", "date"], trim: true },
        value: { type: String, trim: true }
      }],
  },
  { timestamps: true },
);

Schema.pre("save", function (next, params) {
  if (params?.fromUser) {
    this._user = getVirtualUser(params.fromUser);
  }
  this.updatedAt = new Date();
  next();
});

Schema.set("toObject", { virtuals: true });
Schema.set("toJSON", { virtuals: true });

Schema.plugin(patchHistory, {
  mongoose,
  name: `${MODELNAME}Patches`,
  trackOriginalValue: true,
  includes: {
    modelName: { type: String, required: true, default: MODELNAME },
    user: { type: Object, required: false, from: "_user" },
  },
  excludes: ["/updatedAt"],
});

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
