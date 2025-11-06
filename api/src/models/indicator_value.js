const mongoose = require("mongoose");
const { updateActionCompleteness, shouldUpdateActionCompleteness } = require("../utils/actions");

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

Schema.pre("save", async function (next) {
  if (this.isModified("value")) {
    let oldValue = null;
    
    if (!this.isNew && this._id) {
      const oldDoc = await this.constructor.findById(this._id);
      if (oldDoc) {
        oldValue = oldDoc.value;
      }
    }
    
    const newValue = this.value;
    
    if (shouldUpdateActionCompleteness(oldValue, newValue)) {
      this._shouldUpdateCompleteness = true;
    }
  }
  next();
});

Schema.post("save", async function () {
  if (this._shouldUpdateCompleteness && this.action_id) {
    await updateActionCompleteness(this.action_id, mongoose.model(MODELNAME));
  }
});

// Hook for findOneAndUpdate / findByIdAndUpdate
Schema.pre("findOneAndUpdate", async function () {
  const update = this.getUpdate();
  if (update && (update.$set || update.value !== undefined)) {
    const updateValue = update.$set ? update.$set.value : update.value;
    if (updateValue !== undefined) {
      const query = this.getQuery();
      const oldDoc = await this.model.findOne(query);
      if (oldDoc) {
        const oldValue = oldDoc.value;
        const newValue = updateValue;
        if (shouldUpdateActionCompleteness(oldValue, newValue)) {
          this._shouldUpdateCompleteness = true;
          this._actionId = oldDoc.action_id;
        }
      }
    }
  }
});

Schema.post("findOneAndUpdate", async function () {
  if (this._shouldUpdateCompleteness && this._actionId) {
    await updateActionCompleteness(this._actionId, mongoose.model(MODELNAME));
  }
});

// Hook for findByIdAndDelete / findOneAndDelete
Schema.pre("findOneAndDelete", async function () {
  const query = this.getQuery();
  const doc = await this.model.findOne(query);
  if (doc && doc.action_id) {
    this._actionIdToUpdate = doc.action_id;
  }
});

Schema.post("findOneAndDelete", async function () {
  if (this._actionIdToUpdate) {
    await updateActionCompleteness(this._actionIdToUpdate, mongoose.model(MODELNAME));
  }
});

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
