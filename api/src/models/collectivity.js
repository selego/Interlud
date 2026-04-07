const mongoose = require('mongoose');

const MODELNAME = 'collectivity';

const Schema = new mongoose.Schema(
  {
    name: { type: String, trim: true, unique: true },
    description: { type: String, trim: true },
    department: { type: String, trim: true },
    population: { type: Number, trim: true },
    siren: { type: Number, trim: true },
    year: { type: Number, trim: true },
    area: { type: Number, trim: true },
    basedata_onboarded: { type: Boolean, default: false },
    parc_types_onboarded: { type: Boolean, default: false },
    sharepoint_folder_id: { type: String, trim: true },
    aggregation_excel_file_id: { type: String, trim: true },
  },
  { timestamps: true },
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
