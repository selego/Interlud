const mongoose = require("mongoose");

const MODELNAME = "action";

const Schema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    collectivity_id: { type: String, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ["pending", "in_progress", "completed", "cancelled"], trim: true },
    start_year: { type: Number, trim: true },
    end_year: { type: Number, trim: true },
    costs: { type: Number, trim: true },
  },
  { timestamps: true },
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
