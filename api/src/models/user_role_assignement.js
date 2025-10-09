const mongoose = require("mongoose");

const MODELNAME = "user_role_assignement";

const Schema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    user_id: { type: String, trim: true },
    collectivity_id: { type: String, trim: true },
    permissions: [{ type: String, enum: ["read", "write"] }],
    description: { type: String, trim: true },
  },
  { timestamps: true },
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
