const mongoose = require("mongoose");

const MODELNAME = "action_log";

const Schema = new mongoose.Schema(
  {
    action_id: { type: String, required: true },
    action_name: { type: String, required: true },
    collectivity_id: { type: String, required: true },
    collectivity_name: { type: String, required: true },
    field: { type: String, required: true }, 
    operation: { type: String, required: true, enum: ["add", "update"] }, 
    new_value: { type: mongoose.Schema.Types.Mixed }, 
    previous_value: { type: mongoose.Schema.Types.Mixed }, 
    date: { type: Date, default: Date.now, required: true },
    user_id: { type: String, required: true },
    user_name: { type: String, required: true },
    user_email: { type: String, required: true },
    user_role: { type: String, required: true, enum: ["admin", "user"] },
    user_collectivities:{type:Object, required: true},
    sync_auto: { type: Boolean, default: false },
  },
  { timestamps: true },
);

Schema.index({ action_id: 1, date: -1 });
Schema.index({ action_id: 1, field: 1 });
Schema.index({ field: 1 });

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;

