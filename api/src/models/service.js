const mongoose = require("mongoose");

const MODELNAME = "service";

const Schema = new mongoose.Schema({
  //pre-signup
  name: { type: String, trim: true },
  country: { type: String, trim: true },
  email: { type: String, required: true, unique: true, trim: true },
  phone: { type: String, trim: true },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
