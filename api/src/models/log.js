const mongoose = require("mongoose");

const MODELNAME = "log";

const Schema = new mongoose.Schema(
  {
    model_name: { type: String },
    name: { type: String },
    
    field: { type: String },
    operation: { type: String, enum: ["add", "update", "delete"] },
    new_value: { type: mongoose.Schema.Types.Mixed },
    previous_value: { type: mongoose.Schema.Types.Mixed },
    type_value: { type: String},
    date: { type: Date, default: Date.now },

    user_id: { type: String },
    user_name: { type: String },
    user_email: { type: String },

    indicator_value_id: { type: String },
    indicator_value_name: { type: String },

    indicator_category_id: { type: String },
    indicator_category_name: { type: String },

    user_action_right_id: { type: String },
    user_action_right_name: { type: String },

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