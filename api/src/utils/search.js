// Outils de recherche partagés par les contrôleurs (audit sécurité SEC-04 / SEC-14).

// Échappe les caractères spéciaux d'une saisie utilisateur avant de l'utiliser dans un $regex.
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Une recherche absente (undefined, null, '') est ignorée ; toute autre valeur doit être une chaîne.
// Refuse notamment les objets du type { $ne: … } injectés dans le corps JSON.
const isInvalidSearch = (value) => value !== undefined && value !== null && value !== '' && typeof value !== 'string';

// Filtre $regex insensible à la casse, avec la saisie échappée.
const searchRegex = (value) => ({ $regex: escapeRegex(value), $options: 'i' });

// Tri : renvoie le champ s'il appartient à la liste fermée, sinon le tri par défaut.
const pickSortField = (value, allowed, defaultField) => (typeof value === 'string' && allowed.includes(value) ? value : defaultField);

module.exports = { escapeRegex, isInvalidSearch, searchRegex, pickSortField };
