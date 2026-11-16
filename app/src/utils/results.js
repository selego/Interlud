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
