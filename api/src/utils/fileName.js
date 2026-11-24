const ERROR_CODES = require('./errorCodes');

// Noms repris dans le nom d'un fichier Excel créé sur SharePoint.
// Caractères refusés : " * : < > ? / \ | (interdits par SharePoint / OneDrive), # et % (refusés selon la
// configuration du site), & (coupe la recherche du fichier copié dans Microsoft Graph).
const FORBIDDEN_FILE_NAME_CHARACTERS = ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '#', '&', '%'];
const ACTION_NAME_MAX_LENGTH = 150;

// Caractères refusés, ou caractères de contrôle (retour à la ligne, tabulation…)
const hasForbiddenFileNameCharacters = (value) => typeof value === 'string' && (FORBIDDEN_FILE_NAME_CHARACTERS.some((c) => value.includes(c)) || /\p{Cc}/u.test(value));

// Code d'erreur si le nom d'action (déjà débarrassé de ses espaces de début et de fin) est refusé, sinon null
const getActionNameError = (name) => {
  if (typeof name !== 'string' || !name) return ERROR_CODES.INVALID_BODY;
  if (name.length > ACTION_NAME_MAX_LENGTH) return ERROR_CODES.ACTION_NAME_TOO_LONG;
  if (hasForbiddenFileNameCharacters(name)) return ERROR_CODES.ACTION_NAME_INVALID_CHARACTERS;
  return null;
};

// Nom saisi librement (ex. nom d'organisation) : réduit aux lettres, chiffres, espaces, points et tirets.
// S'il ne reste rien (ex. « &&& »), « Organisation » pour que le nom du fichier ne commence pas par « _ ».
const toSafeFileName = (value) =>
  String(value || '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} .-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim() || 'Organisation';

module.exports = { FORBIDDEN_FILE_NAME_CHARACTERS, ACTION_NAME_MAX_LENGTH, hasForbiddenFileNameCharacters, getActionNameError, toSafeFileName };
