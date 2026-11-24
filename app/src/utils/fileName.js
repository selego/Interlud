// Le nom d'une action sert à nommer ses fichiers Excel sur SharePoint : ces caractères y sont refusés.
// Même liste que l'API (api/src/utils/fileName.js).
export const FORBIDDEN_FILE_NAME_CHARACTERS = ["/", "\\", ":", "*", "?", '"', "<", ">", "|", "#", "&", "%"];

export const FORBIDDEN_CHARACTERS_HINT = `Caractères non acceptés : ${FORBIDDEN_FILE_NAME_CHARACTERS.join(" ")}`;

// Même texte que le code d'erreur renvoyé par l'API (ACTION_NAME_INVALID_CHARACTERS)
export const ACTION_NAME_INVALID_CHARACTERS = `Le nom de l'action contient des caractères non acceptés : ${FORBIDDEN_FILE_NAME_CHARACTERS.join(" ")}`;

export const hasForbiddenFileNameCharacters = (value) => typeof value === "string" && FORBIDDEN_FILE_NAME_CHARACTERS.some((c) => value.includes(c));
