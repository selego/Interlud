const mongoose = require('mongoose');

// Accès aux données d'une collectivité : l'admin plateforme passe toujours,
// les autres utilisateurs doivent en être membres avec une adhésion approuvée.
function isApprovedMember(user, collectivityId) {
  if (user?.role === 'admin') return true;
  if (!collectivityId) return false;
  return (user?.collectivities || []).some((c) => c.id === String(collectivityId) && c.status === 'approved');
}

// Une fiche du catalogue (type global) n'a pas de collectivité : elle est lue dans le fichier de la collectivité demandée.
// Toute autre fiche doit appartenir à la collectivité demandée.
function isActionInCollectivity(action, collectivityId) {
  if (action.type === 'global') return true;
  return !!action.collectivity_id && action.collectivity_id === String(collectivityId);
}

// Écriture sur une action existante (modification, années, valeurs) : admin plateforme, membre approuvé de sa
// collectivité (hors rôle acteur économique) ou acteur économique propriétaire.
function canEditAction(user, action) {
  if (user.role === 'admin') return true;
  if (!!action.collectivity_id && (user.collectivities || []).some((c) => c.id === action.collectivity_id && c.status === 'approved' && c.role !== 'economic_actor')) return true;
  return !!action.economic_actor_id && action.economic_actor_id === user.economic_actor_id;
}

// Lecture d'une action : les fiches du catalogue (type global) sont lues par tous (catalogue, tableau de bord parent).
// Sinon, mêmes droits que l'écriture, élargis aux membres approuvés de la collectivité de l'action quel que soit leur rôle
// dans la collectivité (comme les routes de résultats). Un compte acteur économique ne lit que les actions de son organisation.
function canReadAction(user, action) {
  if (action.type === 'global') return true;
  if (user.role === 'economic_actor') return !!action.economic_actor_id && action.economic_actor_id === user.economic_actor_id;
  return canEditAction(user, action) || isApprovedMember(user, action.collectivity_id);
}

// Création d'une action dans une collectivité : admin plateforme, administrateur approuvé de la collectivité,
// ou acteur économique dont le rattachement à la collectivité est approuvé (il crée alors pour sa propre organisation).
function canCreateAction(user, collectivityId) {
  if (user.role === 'admin') return true;
  return (user.collectivities || []).some((c) => c.id === String(collectivityId) && c.status === 'approved' && (user.role === 'economic_actor' || c.role === 'admin'));
}

// Périmètre de propagation d'une valeur vers les autres valeurs et fichiers du propriétaire de l'action.
// Les données d'un acteur économique sont communes à ses collectivités : seuls l'acteur lui-même et l'admin plateforme
// les propagent hors de la collectivité de l'action.
function propagationScope(user, action) {
  if (action.owner !== 'economic_actor' || !action.economic_actor_id) return { owner: action.owner, collectivity_id: action.collectivity_id };
  if (user.role === 'admin' || action.economic_actor_id === user.economic_actor_id) return { owner: 'economic_actor', economic_actor_id: action.economic_actor_id };
  return { owner: 'economic_actor', economic_actor_id: action.economic_actor_id, collectivity_id: action.collectivity_id };
}

// Identifiant Mongo transmis par le client : une chaîne convertible en ObjectId (ni nombre, ni objet)
const isObjectId = (id) => typeof id === 'string' && mongoose.isValidObjectId(id);

module.exports = { isApprovedMember, isActionInCollectivity, canEditAction, canReadAction, canCreateAction, propagationScope, isObjectId };
