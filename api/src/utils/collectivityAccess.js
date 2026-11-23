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

// Création d'une action dans une collectivité : admin plateforme, administrateur approuvé de la collectivité,
// ou acteur économique dont le rattachement à la collectivité est approuvé (il crée alors pour sa propre organisation).
function canCreateAction(user, collectivityId) {
  if (user.role === 'admin') return true;
  return (user.collectivities || []).some((c) => c.id === String(collectivityId) && c.status === 'approved' && (user.role === 'economic_actor' || c.role === 'admin'));
}

module.exports = { isApprovedMember, isActionInCollectivity, canEditAction, canCreateAction };
