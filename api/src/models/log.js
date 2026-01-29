const mongoose = require('mongoose');

const MODELNAME = 'log';

const Schema = new mongoose.Schema(
  {
    model_name: { type: String },
    name: { type: String },

    field: { type: String },
    operation: { type: String, enum: ['add', 'update', 'delete', 'duplicate', 'add_previsionnel'] },
    new_value: {
      string: { type: String, trim: true },
      array: { type: Array, default: [] },
      number: { type: Number, default: 0 },
      date: { type: Date, trim: true },
      boolean: { type: Boolean, default: false },
    },

    previous_value: {
      string: { type: String, trim: true },
      array: { type: Array, default: [] },
      number: { type: Number, default: 0 },
      date: { type: Date, trim: true },
      boolean: { type: Boolean, default: false },
    },

    type_value: { type: String },
    date: { type: Date, default: Date.now },
    source: { type: String, enum: ['manual', 'import_excel', 'default_value', 'synchronization'] },

    // References
    user_id: { type: String },
    user_name: { type: String },
    user_email: { type: String },

    indicator_value_id: { type: String },
    indicator_value_name: { type: String },

    indicator_category_id: { type: String },
    indicator_category_name: { type: String },

    user_action_right_id: { type: String },
    user_action_right_name: { type: String },

    collectivity_id: { type: String },
    collectivity_name: { type: String },

    action_id: { type: String },
    action_name: { type: String },

    economic_actor_id: { type: String },
    economic_actor_name: { type: String },

    indicator_id: { type: String },
    indicator_name: { type: String },
  },
  { timestamps: true }
);

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
