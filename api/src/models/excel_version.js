const mongoose = require('mongoose');

const MODELNAME = 'excel_version';

const Schema = new mongoose.Schema(
  {
    file_name: { type: String, trim: true },
    excel_file_id: { type: String, trim: true },
    version: { type: Number },
    status: { type: String, enum: ['processing', 'done', 'error'], default: 'processing' },
    error_message: { type: String },
    stats: { type: Object },
    is_active: { type: Boolean, default: false },
    uploaded_by_id: { type: String },
    uploaded_by_name: { type: String },
  },
  { timestamps: true },
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
