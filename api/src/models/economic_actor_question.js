const mongoose = require('mongoose');

const MODELNAME = 'economic_actor_question';

// Question du questionnaire acteurs économiques : indépendante des indicateurs et des fichiers Excel.
const Schema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    type: { type: String, enum: ['number', 'text', 'radio', 'checkbox'], default: 'text', trim: true },
    value_possibilities: { type: [String], default: [] },
    value_unit: { type: String, trim: true },
    // Fiches du catalogue (actions de type global) auxquelles la question est rattachée
    actions: [
      {
        id: String,
        name: String,
      },
    ],
    order: { type: Number, default: 0 },
    // Une question désactivée n'est plus proposée aux acteurs ; ses réponses sont conservées
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
