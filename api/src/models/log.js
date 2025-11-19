const mongoose = require("mongoose");

const MODELNAME = "log";

const Schema = new mongoose.Schema(
  {
    model_name: { type: String },
    entity_id: { type: String },
    entity_name: { type: String },
    
    field: { type: String },
    operation: { type: String, enum: ["add", "update", "delete"] },
    new_value: { type: mongoose.Schema.Types.Mixed },
    previous_value: { type: mongoose.Schema.Types.Mixed },
    date: { type: Date, default: Date.now },

    user_id: { type: String },
    user_name: { type: String },
    user_email: { type: String },


    // relations 
    collectivity_id: { type: String },
    collectivity_name: { type: String },
    action_id: { type: String },
    action_name: { type: String },
    indicator_id: { type: String },
    indicator_name: { type: String },
  },
  { timestamps: true }
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;