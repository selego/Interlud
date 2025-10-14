const mongoose = require("mongoose");

const MODELNAME = "action_indicator_value";

const Schema = new mongoose.Schema(
  {
    action_id: { type: String, trim: true },
    collectivity_id: { type: String, trim: true },
    collectivity_name: { type: String, trim: true },
    indicator_id: { type: String, trim: true },
    indicator_name: { type: String, trim: true },
    situation: { type: String, enum: ["init", "ref", "prev", "expost"], trim: true },
    year: { type: Number, trim: true },
    value: { type: Number, trim: true },
    source: { type: String, trim: true },
    comment: { type: String, trim: true },
  },
  { timestamps: true },
);

Schema.post("save", async function (doc) {
  try {
    await mongoose.model(MODELNAME).updateMany(
      {
        _id: { $ne: doc._id },
        indicator_id: doc.indicator_id,
        collectivity_id: doc.collectivity_id,
      },
      {
        $set: { value: doc.value },
      },
    );
  } catch (error) {
    console.error("Erreur lors de la synchronisation des valeurs:", error);
  }
});

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
