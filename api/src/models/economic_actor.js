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
      },
    ],
  },
  { timestamps: true }
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
