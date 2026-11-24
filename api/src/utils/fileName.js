// Noms repris dans le nom d'un fichier Excel créé sur SharePoint.
// Caractères refusés : " * : < > ? / \ | (interdits par SharePoint / OneDrive), # et % (refusés selon la
// configuration du site), & (coupe la recherche du fichier copié dans Microsoft Graph).
const FORBIDDEN_FILE_NAME_CHARACTERS = ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '#', '&', '%'];

const hasForbiddenFileNameCharacters = (value) => typeof value === 'string' && FORBIDDEN_FILE_NAME_CHARACTERS.some((c) => value.includes(c));

// Nom saisi librement (ex. nom d'organisation) : réduit aux lettres, chiffres, espaces, points et tirets.
const toSafeFileName = (value) =>
  String(value || '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} .-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

module.exports = { FORBIDDEN_FILE_NAME_CHARACTERS, hasForbiddenFileNameCharacters, toSafeFileName };
