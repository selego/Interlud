const mongoose = require("mongoose");

const MODELNAME = "indicatorValuePatch";

const Schema = new mongoose.Schema(
  {
    indicator_value_id: { type: String, required: true },
    indicator_value_name: { type: String, required: false },
    indicator_id: { type: String, required: true },
    indicator_name: { type: String, required: true },
    action_id: { type: String, required: true },
    action_name: { type: String, required: true },
    collectivity_id: { type: String, required: true },
    collectivity_name: { type: String, required: true },
    indicator_situation: { type: String, enum: ["init", "ref", "prev", "expost"], trim: true },
    indicator_year: { type: Number, trim: true },
    field: { type: String, required: true },
    operation: { type: String, required: true, enum: ["add", "update"] },
    new_value: { type: mongoose.Schema.Types.Mixed },
    previous_value: { type: mongoose.Schema.Types.Mixed },
    date: { type: Date, default: Date.now, required: true },
    user_id: { type: String, required: true },
    user_name: { type: String, required: true },
    user_email: { type: String, required: true },
    user_role: { type: String, required: true, enum: ["admin", "user"] },
    user_collectivities: { type: Object, required: true },
    sync_auto: { type: Boolean, default: false },
    trigger_action_id: { type: String, required: false },
    trigger_action_name: { type: String, required: false },
  },
  { timestamps: true },
);

Schema.index({ ref: 1, date: -1 });
Schema.index({ ref: 1, path: 1 });
Schema.index({ path: 1 });

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
