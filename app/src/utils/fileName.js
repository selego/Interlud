// Le nom d'une action sert à nommer ses fichiers Excel sur SharePoint : ces caractères y sont refusés.
// Même liste que l'API (api/src/utils/fileName.js).
export const FORBIDDEN_FILE_NAME_CHARACTERS = ["/", "\\", ":", "*", "?", '"', "<", ">", "|", "#", "&", "%"];
export const ACTION_NAME_MAX_LENGTH = 150;

export const FORBIDDEN_CHARACTERS_HINT = `Caractères non acceptés : ${FORBIDDEN_FILE_NAME_CHARACTERS.join(" ")}`;

// Mêmes textes que les codes d'erreur renvoyés par l'API (ACTION_NAME_INVALID_CHARACTERS, ACTION_NAME_TOO_LONG)
export const ACTION_NAME_INVALID_CHARACTERS = `Le nom de l'action contient des caractères non acceptés : ${FORBIDDEN_FILE_NAME_CHARACTERS.join(" ")}`;
export const ACTION_NAME_TOO_LONG = `Le nom de l'action ne doit pas dépasser ${ACTION_NAME_MAX_LENGTH} caractères`;
export const ACTION_NAME_REQUIRED = "Le nom de l'action est obligatoire";
export const ACTION_NAME_ERRORS = [ACTION_NAME_INVALID_CHARACTERS, ACTION_NAME_TOO_LONG];

// Caractères refusés, ou caractères de contrôle (retour à la ligne, tabulation…)
export const hasForbiddenFileNameCharacters = (value) => typeof value === "string" && (FORBIDDEN_FILE_NAME_CHARACTERS.some((c) => value.includes(c)) || /\p{Cc}/u.test(value));

// Message d'erreur pour un nom d'action, "" s'il est accepté
export const getActionNameError = (value) => {
  const name = (value || "").trim();
  if (!name) return ACTION_NAME_REQUIRED;
  if (name.length > ACTION_NAME_MAX_LENGTH) return ACTION_NAME_TOO_LONG;
  if (hasForbiddenFileNameCharacters(name)) return ACTION_NAME_INVALID_CHARACTERS;
  return "";
};
