// Les résultats calculés (graphiques, émissions, gains, scores) sont masqués aux acteurs économiques (décision du 16/10).
// Même règle que l'API (api/src/utils/results.js) : acteur économique globalement (user.role)
// ou dans la collectivité courante (user.collectivities[].role). Sans collectivité courante, masqué
// dès que l'utilisateur est acteur économique dans au moins une collectivité.
export function areResultsHidden(user, collectivity) {
  if (user?.role === "economic_actor") return true
  return (user?.collectivities || []).some((c) => c.role === "economic_actor" && (!collectivity?._id || c.id === collectivity._id))
}
