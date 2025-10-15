const mongoose = require("mongoose");

const MODELNAME = "user_role_assignement";

const Schema = new mongoose.Schema(
  {
    user_id: { type: String, trim: true },
    user_name: { type: String, trim: true },
    collectivity_id: { type: String, trim: true },
    collectivity_name: { type: String, trim: true },
    action_id: { type: String, trim: true },
    action_name: { type: String, trim: true },
    description: { type: String, trim: true },
    can_read: { type: Boolean, default: true },
    can_write: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
