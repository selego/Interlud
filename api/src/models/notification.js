const mongoose = require('mongoose');

const MODELNAME = 'notification';

const Schema = new mongoose.Schema(
  {
    message: { type: String, trim: true },
    user_id: { type: String, trim: true },
    user_name: { type: String, trim: true },
    user_email: { type: String, trim: true },
    link: { type: String, trim: true },
    read_at: { type: Date },
  },
  { timestamps: true }
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
