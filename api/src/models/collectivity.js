const mongoose = require('mongoose');

const MODELNAME = 'collectivity';

const Schema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    description: { type: String, trim: true },
    department: { type: Number, trim: true },
    population: { type: Number, trim: true },
    excelFileId: { type: String, trim: true },
    is_onboarded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
