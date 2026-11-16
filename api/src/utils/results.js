// Les résultats calculés (graphiques, émissions, gains, scores) sont masqués aux acteurs économiques (décision du 16/10).
// Un utilisateur est traité comme acteur économique s'il l'est globalement (role === 'economic_actor')
// ou s'il a le rôle 'economic_actor' dans la collectivité ciblée par la requête.
// Sans collectivité ciblée (ex. /excel/export, qui ne reçoit qu'un fileId), on masque dès qu'il est acteur économique
// dans au moins une collectivité : on ne peut pas savoir à quelle collectivité appartient le fichier demandé.
function areResultsHidden(user, collectivityId) {
  if (user.role === 'economic_actor') return true;
  return (user.collectivities || []).some((c) => c.role === 'economic_actor' && (!collectivityId || c.id === String(collectivityId)));
}

module.exports = { areResultsHidden };
