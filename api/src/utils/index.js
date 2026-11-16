const passwordValidator = require("password-validator");

function validatePassword(password) {
  const schema = new passwordValidator();
  schema
    .is()
    .min(12) // Minimum length 12
    .is()
    .max(100) // Maximum length 100
    .has()
    .uppercase() // Must have uppercase letters
    .has()
    .lowercase() // Must have lowercase letters
    .has()
    .digits() // Must have digits
    .has()
    .symbols() // Must have symbols
    .has()
    .not()
    .spaces(); // Should not have spaces

  return schema.validate(password);
}


const BREVO_TEMPLATES = {};

function pickFields(obj, allowed) {
  if (!obj || typeof obj !== 'object') return {};
  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key];
  }
  return out;
}

module.exports = {
  validatePassword,
  pickFields,
  BREVO_TEMPLATES,
};
