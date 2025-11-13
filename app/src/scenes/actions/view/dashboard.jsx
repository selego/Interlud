import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"

export default function Dashboard({ action }) {
  const { userActionRights, user } = useStore()
  const [indicatorValues, setIndicatorValues] = useState([])
  const [stats, setStats] = useState({ total: 0, filled: 0, empty: 0, completion: 0, bySituation: { init: 0, ref: 0, prev: 0, expost: 0 } })
  const navigate = useNavigate()

  const isAdmin = user.role === "admin" || user.collectivities.some(c => c.id === action.collectivity_id && c.role === "admin");
  const right = userActionRights.find(right => right.action_id === action._id);

  const calculateStats = (data) => {
    const filled = data.filter(v => v.value != null && v.value !== "").length;
    const total = data.length;
    const empty = total - filled;
    const completion = total > 0 ? Math.round((filled / total) * 100) : 0;
    const bySituation = {
      init: data.filter(v => v.situation === "init" && v.value != null && v.value !== "").length,
      ref: data.filter(v => v.situation === "ref" && v.value != null && v.value !== "").length,
      prev: data.filter(v => v.situation === "prev" && v.value != null && v.value !== "").length,
      expost: data.filter(v => v.situation === "expost" && v.value != null && v.value !== "").length,
    };
    
    return { total, filled, empty, completion, bySituation };
  };

  const fetchData = async () => {
    try {
      const { ok, data, code } = await api.post(`/indicator_value/search`, { action_id: action._id });
      if (!ok) return toast.error(code || "Une erreur est survenue");
      const situationOrder = ["init", "ref", "prev", "expost"];
      const sortedData = [...data].sort((a, b) => {
        const aIdx = situationOrder.indexOf(a.situation);
        const bIdx = situationOrder.indexOf(b.situation);
        return aIdx - bIdx;
      });

      setIndicatorValues(sortedData);
      setStats(calculateStats(data));
    } catch (error) {
      toast.error("Une erreur est survenue");
    }
  };

  useEffect(() => {
    fetchData();
  }, [action]);

  if (!isAdmin && !right?.can_read) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Vous n'avez pas les droits pour accéder à cette action</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard de l'action</h1>
          <div className="flex gap-3">
            {(isAdmin || right?.can_write) && (
              <button className="button-primary" onClick={() => navigate(`/actions/${action._id}/completion`)}>
              Compléter l'action
            </button>
            )}
            {isAdmin && (
              <button className="button-primary" onClick={() => navigate(`/actions/${action._id}/settings`)}>
              Gérer l'action
            </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="p-6 card-shadow">
            <p className="text-gray-600 text-sm mb-2">Indicateurs</p>
            <p className="text-4xl font-bold text-blue-600">{indicatorValues.length/4}</p>
            <p className="text-xs text-gray-500 mt-1">Nombre d'indicateurs</p>
          </div>

          <div className="p-6 card-shadow">
            <p className="text-gray-600 text-sm mb-2">Complétion</p>
            <p className="text-4xl font-bold text-green-600">{stats.completion}%</p>
            <p className="text-xs text-gray-500 mt-1">{stats.filled} / {stats.total} valeurs</p>
          </div>

          <div className="p-6 card-shadow">
            <p className="text-gray-600 text-sm mb-2">Remplis</p>
            <p className="text-4xl font-bold text-green-600">{stats.filled}</p>
            <p className="text-xs text-gray-500 mt-1">Valeurs complètes</p>
          </div>

          <div className="p-6 card-shadow">
            <p className="text-gray-600 text-sm mb-2">À compléter</p>
            <p className="text-4xl font-bold text-orange-600">{stats.empty}</p>
            <p className="text-xs text-gray-500 mt-1">Valeurs manquantes</p>
          </div>
        </div>

        <div className="p-6 card-shadow mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Progression globale</h2>
          <div className="w-full bg-gray-200 rounded-full h-6">
            <div 
              className="bg-primary-green h-6 rounded-full flex items-center justify-center text-white text-sm font-medium"
              style={{ width: `${stats.completion}%` }}
            >
              {stats.completion > 10 && `${stats.completion}%`}
            </div>
          </div>
        </div>

        <div className="p-6 card-shadow mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Complétion par situation</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-2">Initial</p>
              <p className="text-2xl font-bold text-blue-600">{stats.bySituation.init}</p>
              <p className="text-xs text-gray-500">/ {indicatorValues.filter(v => v.situation === "init").length}</p>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-2">Référence</p>
              <p className="text-2xl font-bold text-purple-600">{stats.bySituation.ref}</p>
              <p className="text-xs text-gray-500">/ {indicatorValues.filter(v => v.situation === "ref").length}</p>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-2">Prévisionnel</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.bySituation.prev}</p>
              <p className="text-xs text-gray-500">/ {indicatorValues.filter(v => v.situation === "prev").length}</p>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-2">Ex-post</p>
              <p className="text-2xl font-bold text-green-600">{stats.bySituation.expost}</p>
              <p className="text-xs text-gray-500">/ {indicatorValues.filter(v => v.situation === "expost").length}</p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden card-shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Liste des indicateurs</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nom de l'indicateur</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Situation</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {indicatorValues.map((indicatorValue) => (
                <tr key={indicatorValue._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{indicatorValue.indicator_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 capitalize">{indicatorValue.situation}</td>
                  <td className="px-6 py-4 text-sm">
                    {indicatorValue.value != null && indicatorValue.value !== "" ? (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                        Rempli
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-medium">
                        À compléter
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}