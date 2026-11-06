const mongoose = require('mongoose');

const MODELNAME = 'economic_actor_answer';

// Réponse d'un acteur économique à une question : une seule par acteur et par question.
// Stockée hors indicator_value, sans synchronisation Excel.
const Schema = new mongoose.Schema(
  {
    economic_actor_id: { type: String, required: true, trim: true },
    economic_actor_name: { type: String, trim: true },
    question_id: { type: String, required: true, trim: true },
    question_label: { type: String, trim: true },
    value: {
      text: { type: String, trim: true },
      number: { type: Number },
      radio: { type: String, trim: true },
      checkbox: { type: Array, default: [] },
    },
    last_modif_by_id: { type: String, trim: true },
    last_modif_by_name: { type: String, trim: true },
  },
  { timestamps: true },
);

Schema.index({ economic_actor_id: 1, question_id: 1 }, { unique: true });

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
