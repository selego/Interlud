const mongoose = require("mongoose");

const MODELNAME = "collectivity";

const Schema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    description: { type: String, trim: true },
    department: { type: Number, trim: true },
    population: { type: Number, trim: true },
    excelFileId: { type: String, trim: true },
    economic_actors: [
      {
        economic_actor_id: { type: String, required: true, trim: true },
        economic_actor_name: { type: String, trim: true },
        joined_at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
