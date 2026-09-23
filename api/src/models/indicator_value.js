const mongoose = require('mongoose');

const MODELNAME = 'indicator_value';

// Condition d'affichage : une feuille compare la valeur d'un indicateur source.
const leafCondition = {
  type: { type: String, enum: ['equals', 'contains', 'greaterThan', 'lessThan', 'greaterOrEqual', 'lessOrEqual', 'notEmpty', 'isEmpty', 'neverVisible'] },
  excel_indicator_id: { type: String },
  excel_indicator_situation: { type: String, enum: ['init', 'ref', 'prev', 'expost'] },
  value: { type: mongoose.Schema.Types.Mixed },
  negate: { type: Boolean, default: false },
};

// Un noeud est soit une feuille, soit un groupe (operator + sous-conditions) permettant (A OR B) AND C.
// Les sous-conditions sont en Mixed pour autoriser une imbrication de profondeur arbitraire (OR → AND → OR...).
const conditionNode = { ...leafCondition, operator: { type: String, enum: ['AND', 'OR'] }, conditions: [mongoose.Schema.Types.Mixed] };

const Schema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    action_id: { type: String, trim: true },
    action_name: { type: String, trim: true },
    collectivity_id: { type: String, trim: true },
    collectivity_name: { type: String, trim: true },

    owner: {
      type: String,
      enum: ['collectivity', 'economic_actor'],
      default: 'collectivity',
      trim: true,
    },

    indicator_value_collectivity_id: { type: String, trim: true },
    economic_actor_id: { type: String, trim: true },
    economic_actor_name: { type: String, trim: true },
    indicator_id: { type: String, trim: true },
    indicator_name: { type: String, trim: true },
    // Si défini, indicator_name est résolu dynamiquement au fetch : les marqueurs {0}, {1}… du template
    // sont remplacés par la valeur des IVs sources (ex : titre ref affichant la catégorie choisie en init)
    indicator_name_source: {
      template: { type: String },
      sources: [
        {
          excel_indicator_id: { type: String },
          situation: { type: String, enum: ['init', 'ref', 'prev', 'expost'] },
          // Si défini, la valeur affichée = valeur × valeur du facteur (titre "Sur les N×P colis…") ; les opérandes en % sont divisés par 100
          factor_source: {
            excel_indicator_id: { type: String },
            situation: { type: String, enum: ['init', 'ref', 'prev', 'expost'] },
          },
        },
      ],
    },
    indicator_description: { type: String, trim: true },
    indicator_type: { type: String, enum: ['number', 'text', 'radio', 'checkbox'], trim: true },
    indicator_value_possibilities: { type: Array, default: [] },
    // Si défini, la liste de possibilités est résolue dynamiquement au fetch depuis la valeur de l'IV source
    indicator_value_possibilities_source: {
      excel_indicator_id: { type: String },
      situation: { type: String, enum: ['init', 'ref', 'prev', 'expost'] },
      extra_values: { type: [String], default: undefined }, // valeurs fixes ajoutées à la liste résolue (ex : "Aucun")
    },
    // Si défini, value_default est résolu dynamiquement au fetch depuis la valeur de l'IV source :
    // valeur × factor + offset, ou valeur × (1 + évolution/100) si growth_source (IV d'évolution en %)
    indicator_value_default_source: {
      excel_indicator_id: { type: String },
      situation: { type: String, enum: ['init', 'ref', 'prev', 'expost'] },
      factor: { type: Number },
      offset: { type: Number },
      growth_source: {
        excel_indicator_id: { type: String },
        situation: { type: String, enum: ['init', 'ref', 'prev', 'expost'] },
      },
    },
    indicator_category_id: { type: String, trim: true },
    indicator_category_name: { type: String, trim: true },
    indicator_sub_category_id: { type: String, trim: true },
    indicator_sub_category_name: { type: String, trim: true },
    indicator_value_unit: { type: String, trim: true },
    indicator_excel_id: { type: String, trim: true },
    is_primordial: { type: Boolean, default: false },
    excel_line_number: { type: Number, trim: true },
    display_condition: {
      operator: { type: String, enum: ['AND', 'OR'] },
      conditions: [conditionNode],
    },
    display_acteureco: { type: Boolean, default: true },
    situation: { type: String, enum: ['init', 'ref', 'prev', 'expost'], trim: true },
    year: { type: Number, trim: true },
    value_source: { type: String, trim: true },
    comment: { type: String, trim: true },
    value: {
      text: { type: String, trim: true },
      number: { type: Number, trim: true },
      radio: { type: String, trim: true },
      checkbox: { type: Array, default: [] },
    },
    value_default: {
      text: { type: String, trim: true },
      number: { type: Number, trim: true },
      radio: { type: String, trim: true },
      checkbox: { type: Array, default: [] },
    },
  },
  { timestamps: true },
);

Schema.index({ indicator_id: 1, situation: 1 });
Schema.index({ collectivity_id: 1, situation: 1 });
Schema.index({ action_id: 1, situation: 1, year: 1 });
Schema.index({ action_id: 1, excel_line_number: 1 });
Schema.index({ owner: 1, action_id: 1 });
Schema.index({ collectivity_id: 1, indicator_excel_id: 1, situation: 1, year: 1 });

const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
