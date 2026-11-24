// Les résultats calculés (graphiques, émissions, gains, scores) sont masqués aux acteurs économiques (décision du 16/10).
// Même règle que l'API (api/src/utils/results.js) : acteur économique globalement (user.role)
// ou dans la collectivité courante (user.collectivities[].role). Sans collectivité courante, masqué
// dès que l'utilisateur est acteur économique dans au moins une collectivité. L'admin voit toujours les résultats.
// `collectivity` est soit l'objet collectivité (store), soit son id (ex. action.collectivity_id).
export function areResultsHidden(user, collectivity) {
  if (user?.role === "admin") return false
  if (user?.role === "economic_actor") return true
  const collectivityId = typeof collectivity === "string" ? collectivity : collectivity?._id
  return (user?.collectivities || []).some((c) => c.role === "economic_actor" && (!collectivityId || c.id === collectivityId))
}

// Exception (décision du 24/11), même règle que l'API : un acteur économique voit les résultats de ses propres actions
// (action de son organisation, ou fiche du catalogue regroupant ses remplissages pour un compte acteur économique).
// Le tableau de bord collectif (accueil, comparaison) reste masqué.
export function areActionResultsHidden(user, action, collectivity) {
  if (!areResultsHidden(user, collectivity)) return false
  if (user?.role !== "economic_actor" || !user.economic_actor_id) return true
  if (action?.type === "global") return false
  return !(action?.owner === "economic_actor" && action.economic_actor_id === user.economic_actor_id)
}
