import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/services/api"
import toast from "react-hot-toast"
import useStore from "@/services/store"
import { FiArrowLeft } from "react-icons/fi"
import Loader from "@/components/loader"

export default function Dashboard({ action }) {
  const { userActionRights, user } = useStore()
  const [indicatorValues, setIndicatorValues] = useState([])
  const [stats, setStats] = useState({ total: 0, filled: 0, empty: 0, completeness: 0, bySituation: { init: 0, ref: 0, prev: 0, expost: 0 } })
  const navigate = useNavigate()

  const isAdmin = user.role === "admin" || user.collectivities.some((c) => c.id === action.collectivity_id && c.role === "admin")
  const isEconomicActorAsRight = user.role === "economic_actor" && action.owner === "economic_actor" && user.economic_actor_id === action.economic_actor_id
  const right = userActionRights.find((right) => right.action_id === action._id)

  const isIndicatorValueFilled = (indicatorValue) => {
    const val = indicatorValue.value?.[indicatorValue.indicator_type]
    if (indicatorValue.indicator_type === "checkbox") return Array.isArray(val) && val.length > 0
    return val !== null && val !== undefined && val !== ""
  }

  const calculateStats = (data) => {
    const bySituation = {
      init: data.filter((v) => v.situation === "init" && isIndicatorValueFilled(v)).length,
      ref: data.filter((v) => v.situation === "ref" && isIndicatorValueFilled(v)).length,
      prev: data.filter((v) => v.situation === "prev" && isIndicatorValueFilled(v)).length,
      expost: data.filter((v) => v.situation === "expost" && isIndicatorValueFilled(v)).length
    }
    return {
      total: data.length,
      filled: data.filter(isIndicatorValueFilled).length,
      empty: data.length - data.filter(isIndicatorValueFilled).length,
      completeness: Math.round((data.filter(isIndicatorValueFilled).length / data.length) * 100),
      bySituation
    }
  }

  const fetchIndicatorValues = async () => {
    try {
      const { ok, data, code } = await api.post(`/indicator_value/search`, { action_id: action._id, limit: 10000 })
      if (!ok) return toast.error(code || "Une erreur est survenue")
      const situationOrder = ["init", "ref", "prev", "expost"]
      const sortedData = [...data].sort((a, b) => {
        const aIdx = situationOrder.indexOf(a.situation)
        const bIdx = situationOrder.indexOf(b.situation)
        return aIdx - bIdx
      })

      setIndicatorValues(sortedData)
      setStats(calculateStats(data))
    } catch (error) {
      toast.error("Une erreur est survenue")
    }
  }

  useEffect(() => {
    fetchIndicatorValues()
  }, [action])

  if (!isAdmin && !isEconomicActorAsRight && !right?.can_read) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Vous n'avez pas les droits pour accéder à cette action</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
            <button onClick={() => navigate("/actions")} className="hover:text-primary-green transition-colors">
              Actions
            </button>
            <span>/</span>
            <span className="text-gray-900 font-medium truncate max-w-[150px]">{action.name}</span>
          </div>
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-primary-green transition-colors"
                aria-label="Revenir à la page précédente"
              >
                <FiArrowLeft size={18} />
              </button>
              <h1 className="text-3xl font-bold text-gray-900">{action.name}</h1>
            </div>
            <div className="flex gap-3 shrink-0">
              {(isAdmin || right?.can_write || isEconomicActorAsRight) && (
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="p-6 card-shadow">
            <p className="text-gray-600 text-sm mb-2">Indicateurs</p>
            <p className="text-4xl font-bold text-blue-600">
              {new Set(indicatorValues.map((v) => v.indicator_id)).size}
            </p>
            <p className="text-xs text-gray-500 mt-1">Nombre d'indicateurs</p>
          </div>

          <div className="p-6 card-shadow">
            <p className="text-gray-600 text-sm mb-2">Complétion</p>
            <p className="text-4xl font-bold text-green-600">{stats.completeness}%</p>
            <p className="text-xs text-gray-500 mt-1">
              {stats.filled} / {stats.total} valeurs
            </p>
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
            <div className="bg-primary-green h-6 rounded-full flex items-center justify-center text-white text-sm font-medium" style={{ width: `${stats.completeness}%` }}>
              {stats.completeness > 10 && `${stats.completeness}%`}
            </div>
          </div>
        </div>

        <div className="p-6 card-shadow mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Complétion par situation</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-2">Initiale</p>
              <p className="text-2xl font-bold text-blue-600">{stats.bySituation.init}</p>
              <p className="text-xs text-gray-500">/ {indicatorValues.filter((v) => v.situation === "init").length}</p>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-2">Référence</p>
              <p className="text-2xl font-bold text-purple-600">{stats.bySituation.ref}</p>
              <p className="text-xs text-gray-500">/ {indicatorValues.filter((v) => v.situation === "ref").length}</p>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-2">Prévisionnel</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.bySituation.prev}</p>
              <p className="text-xs text-gray-500">/ {indicatorValues.filter((v) => v.situation === "prev").length}</p>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-2">Ex-post</p>
              <p className="text-2xl font-bold text-green-600">{stats.bySituation.expost}</p>
              <p className="text-xs text-gray-500">/ {indicatorValues.filter((v) => v.situation === "expost").length}</p>
            </div>
          </div>
        </div>
        <AggregationTable action={action} />
      </div>
    </div>
  )
}




const INDICATORS = ['GES', 'PM', 'NOx', 'HC', 'CO', 'Énergie'];
const UNITS = ['tCO2e/an', 't/an', 't/an', 't/an', 't/an', 'GWh/an'];

function AggregationTable({ action }) {
  const [data, setData] = useState(null);
  const { collectivity } = useStore();
  const [isLoading, setIsLoading] = useState(false);

  const loadAggregation = async () => {
    if (!collectivity?.excelFileId || !action?.excel_worksheetname) return;
    
    try {
      setIsLoading(true);
      const { ok, data } = await api.post(`/excel/aggregation`, {  excelFileId: collectivity.excelFileId, action: action.excel_worksheetname });
      if (!ok) return toast.error(data.error);
      setData(data);
    } catch (error) {
      console.error(error);
      toast.error("Erreur lors du chargement des données");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAggregation();
  }, [collectivity?.excelFileId, action]);

  const formatValue = (val, isPercent = false) => {
    if (val === null || val === undefined || val === '' || val === '-') return '-';
    if (typeof val === 'number') {
      if (isPercent) return `${(val * 100).toFixed(1)}%`;
      return val.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    }
    return val;
  };

  if (isLoading) return <Loader />;

  if (!action?.excel_worksheetname) return null;

  return (
    <div className="card-shadow overflow-hidden">
      <div className="px-6 py-4 border-b bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-900">Gains environnementaux</h2>
        <p className="text-sm text-gray-500 mt-1">Par comparaison à la situation de référence</p>
      </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700" rowSpan="2">Indicateur</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-yellow-700 border-l" colSpan="2">
                  Prévisionnelle
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-green-700 border-l" colSpan="2">
                  Ex-post
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-l" rowSpan="2">Unité</th>
              </tr>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-600 border-l">Absolue</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-600">Relative</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-600 border-l">Absolue</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-600">Relative</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(data || []).slice(2).map((row, rowIndex) => {
                const label = row[0] || INDICATORS[rowIndex] || '-';
                const unit = row[6] || UNITS[rowIndex] || '-';
                const evolAbsPrev = row[2];
                const evolRelPrev = row[3];
                const evolAbsExpost = row[4];
                const evolRelExpost = row[5];
                
                return (
                  <tr key={rowIndex} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {label}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700 border-l bg-yellow-50/30">
                      {formatValue(evolAbsPrev)}
                    </td>
                    <td className="px-4 py-3 text-center text-sm bg-yellow-50/30">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        typeof evolRelPrev === 'number' && evolRelPrev < 0 
                          ? 'bg-green-100 text-green-800' 
                          : typeof evolRelPrev === 'number' && evolRelPrev > 0 
                            ? 'bg-red-100 text-red-800'
                            : 'text-gray-600'
                      }`}>
                        {formatValue(evolRelPrev, true)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700 border-l bg-green-50/30">
                      {formatValue(evolAbsExpost)}
                    </td>
                    <td className="px-4 py-3 text-center text-sm bg-green-50/30">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        typeof evolRelExpost === 'number' && evolRelExpost < 0 
                          ? 'bg-green-100 text-green-800' 
                          : typeof evolRelExpost === 'number' && evolRelExpost > 0 
                            ? 'bg-red-100 text-red-800'
                            : 'text-gray-600'
                      }`}>
                        {formatValue(evolRelExpost, true)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500 border-l">
                      {unit}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
    </div>
  );
}
