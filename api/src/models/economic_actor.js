const mongoose = require('mongoose');

const MODELNAME = 'economic_actor';

const Schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    collectivities: [
      {
        id: String,
        name: String,
        joined_at: { type: Date, default: Date.now },
        excelFileId: { type: String, trim: true },
        basedata_onboarded: { type: Boolean, default: false },
        parc_types_onboarded: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true }
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
