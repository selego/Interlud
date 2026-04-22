import React, { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/services/api"
import toast from "react-hot-toast"
import { FiChevronDown, FiCheck } from "react-icons/fi"
import Select from "@/components/Select"
import DebounceInput from "@/components/debounceInput"

const getStatusLabel = (status) => {
  if (status === "completed") return "Terminée"
  if (status === "upcoming") return "À venir"
  if (status === "in_progress") return "En cours"
  if (status === "blocked") return "Bloquée"
  return "Nouvelle"
}

function CollectivityFilter({ value, label, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [options, setOptions] = useState([])
  const selectRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectRef.current && !selectRef.current.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const fetchCollectivities = async () => {
    try {
      const { ok, data, code } = await api.post("/collectivity/search", { search, limit: 20 })
      if (!ok) return toast.error(code || "Erreur lors de la récupération des collectivités")
      setOptions(data)
    } catch (error) {
      toast.error(error.message || "Erreur lors de la récupération des collectivités")
    }
  }

  useEffect(() => {
    fetchCollectivities()
  }, [search])

  return (
    <div ref={selectRef} className="relative">
      <button type="button" onClick={() => setIsOpen(!isOpen)} className="input-primary w-full text-left pr-10 truncate">
        <span className="block truncate">{label || "Toutes les collectivités"}</span>
      </button>
      <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
        <FiChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <div className="sticky top-0 bg-white p-2 border-b border-gray-200">
            <DebounceInput
              debounce={300}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="!w-full !px-3 !py-2 !text-xs !border !border-gray-200 !rounded-md focus:!outline-none focus:!border-primary"
            />
          </div>
          <div
            onClick={() => {
              onChange?.("", "")
              setIsOpen(false)
              setSearch("")
            }}
            className={`px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 ${!value ? "bg-primary/10 text-primary" : "text-gray-900"}`}
          >
            <span className="text-xs">Toutes les collectivités</span>
          </div>
          {options.length > 0 ? (
            options.map((option) => (
              <div
                key={option._id}
                onClick={() => {
                  onChange?.(option._id, option.name)
                  setIsOpen(false)
                  setSearch("")
                }}
                className={`px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 ${value === option._id ? "bg-primary/10 text-primary" : "text-gray-900"}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs truncate">{option.name}</span>
                  {value === option._id && <FiCheck className="w-4 h-4 text-primary flex-shrink-0" />}
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-3 text-gray-500 text-sm text-center">Aucun résultat</div>
          )}
        </div>
      )}
    </div>
  )
}

function GlobalActionFilter({ value, onChange }) {
  const [options, setOptions] = useState([])

  const fetchGlobalActions = async () => {
    try {
      const { ok, data, code } = await api.post("/action/search", { type: "global", limit: 100 })
      if (!ok) return toast.error(code || "Erreur lors de la récupération des actions globales")
      setOptions(data)
    } catch (error) {
      toast.error(error.message || "Erreur lors de la récupération des actions globales")
    }
  }

  useEffect(() => {
    fetchGlobalActions()
  }, [])

  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder="Toutes les actions"
      constrained={true}
      options={[{ value: "", label: "Toutes les actions" }, ...options.map((o) => ({ value: o._id, label: o.name }))]}
    />
  )
}

export default function List() {
  const navigate = useNavigate()
  const [actions, setActions] = useState([])
  const [filters, setFilters] = useState({ collectivity_id: "", action_parent_id: "", collectivity_name: "" })

  const fetchActions = async () => {
    try {
      const { ok, data, code } = await api.post("/action/search", {limit: 10000,collectivity_id: filters.collectivity_id,action_parent_id: filters.action_parent_id,})
      if (!ok) return toast.error(code || "Une erreur est survenue")
      setActions(data)
    } catch (error) {
      toast.error(error.message || "Une erreur est survenue")
    }
  }

  useEffect(() => {
    fetchActions()
  }, [filters.collectivity_id, filters.action_parent_id])

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Liste des Actions</h1>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="w-64">
          <CollectivityFilter
            value={filters.collectivity_id}
            label={filters.collectivity_name}
            onChange={(id, name) => setFilters((prev) => ({ ...prev, collectivity_id: id, collectivity_name: name }))}
          />
        </div>
        <div className="w-64">
          <GlobalActionFilter
            value={filters.action_parent_id}
            onChange={(id) => setFilters((prev) => ({ ...prev, action_parent_id: id }))}
          />
        </div>
      </div>

      <table className="w-full overflow-hidden card-shadow">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nom</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Collectivité</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {actions.map((action) => (
            <tr key={action._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/admin/action/${action._id}`)}>
              <td className="px-6 py-4 text-sm font-medium text-gray-900">{action.name}</td>
              <td className="px-6 py-4 text-sm text-gray-600 truncate max-w-xs">{action.collectivity_name}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{getStatusLabel(action.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
