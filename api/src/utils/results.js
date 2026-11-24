// Les résultats calculés (graphiques, émissions, gains, scores) sont masqués aux acteurs économiques (décision du 16/10).
// Un utilisateur est traité comme acteur économique s'il l'est globalement (role === 'economic_actor')
// ou s'il a le rôle 'economic_actor' dans la collectivité ciblée par la requête.
// Sans collectivité ciblée (ex. /excel/export, qui ne reçoit qu'un fileId), on masque dès qu'il est acteur économique
// dans au moins une collectivité : on ne peut pas savoir à quelle collectivité appartient le fichier demandé.
// L'admin voit toujours les résultats, même s'il a le rôle 'economic_actor' dans une collectivité.
function areResultsHidden(user, collectivityId) {
  if (user?.role === 'admin') return false;
  if (user.role === 'economic_actor') return true;
  return (user.collectivities || []).some((c) => c.role === 'economic_actor' && (!collectivityId || c.id === String(collectivityId)));
}

// Exception (décision du 24/11) : un acteur économique voit les résultats de ses propres actions.
// `action` est la fiche relue en base, jamais celle du corps de la requête.
// - Action d'un acteur économique : son organisation doit être celle de l'utilisateur.
// - Fiche du catalogue (tableau de bord regroupant ses remplissages) : seulement pour un compte acteur économique,
//   pour qui les routes lisent le fichier d'agrégation de son organisation et filtrent sur ses actions.
// Le tableau de bord collectif (accueil, synthèse, comparaison) reste masqué.
function areActionResultsHidden(user, action, collectivityId) {
  if (!areResultsHidden(user, collectivityId)) return false;
  if (!user.economic_actor_id) return true;
  if (action.type === 'global') return user.role !== 'economic_actor';
  return !(action.owner === 'economic_actor' && action.economic_actor_id === user.economic_actor_id);
}

module.exports = { areResultsHidden, areActionResultsHidden };
