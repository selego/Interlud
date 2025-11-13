const mongoose = require("mongoose");

const MODELNAME = "actionPatch";

const Schema = new mongoose.Schema(
  {
    ref: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "action" },
    path: { type: String, required: true }, 
    op: { type: String, required: true, enum: ["add", "replace", "remove"] }, 
    value: { type: mongoose.Schema.Types.Mixed }, 
    originalValue: { type: mongoose.Schema.Types.Mixed }, 
    date: { type: Date, default: Date.now, required: true },
    user: { type: Object, required: false }, 
  },
  { timestamps: true },
);

Schema.index({ ref: 1, date: -1 });
Schema.index({ ref: 1, path: 1 });
Schema.index({ path: 1 });

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;

