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

module.exports = { isApprovedMember, isActionInCollectivity };
