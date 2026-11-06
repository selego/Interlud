const mongoose = require('mongoose');

const MODELNAME = 'economic_actor_form';

// Réglages du questionnaire acteurs économiques (document unique) : texte explicatif affiché en haut de la page.
const Schema = new mongoose.Schema(
  {
    intro_text: { type: String, trim: true },
  },
  { timestamps: true },
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
