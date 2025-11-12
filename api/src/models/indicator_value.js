const mongoose = require("mongoose");
const patchHistory = require("mongoose-patch-history").default;

const MODELNAME = "indicator_value";

const Schema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    action_id: { type: String, trim: true },
    action_name: { type: String, trim: true },
    collectivity_id: { type: String, trim: true },
    collectivity_name: { type: String, trim: true },
    indicator_id: { type: String, trim: true },
    indicator_name: { type: String, trim: true },
    indicator_type: { type: String, enum: ["number", "text", "radio", "checkbox"], trim: true },
    indicator_value_possibilities: { type: Array, default: [] },
    indicator_category_id: { type: String, trim: true },
    indicator_category_name: { type: String, trim: true },
    indicator_sub_category_id: { type: String, trim: true },
    indicator_sub_category_name: { type: String, trim: true },
    indicator_default_value: { type: String, trim: true },
    situation: { type: String, enum: ["init", "ref", "prev", "expost"], trim: true },
    year: { type: Number, trim: true },
    value: { type: String, trim: true },
    source: { type: String, trim: true },
    comment: { type: String, trim: true },
  },
  { timestamps: true },
);

Schema.set("toObject", { virtuals: true });
Schema.set("toJSON", { virtuals: true });

Schema.plugin(patchHistory, {
  mongoose,
  name: `${MODELNAME}Patches`,
  trackOriginalValue: true,
  includes: {
    modelName: { type: String, required: true, default: MODELNAME },
    user: { type: Object, required: false, from: "_user" },
  },
  excludes: ["/updatedAt"],
});

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
