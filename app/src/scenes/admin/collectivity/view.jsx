import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import api from "@/services/api"
import toast from "react-hot-toast"
import { FiArrowLeft } from "react-icons/fi";

export default function View() {
    const {id} = useParams()
    const navigate = useNavigate()
    const [collectivity, setCollectivity] = useState({ name: "", population: null, description: "", department: null });

    const getCollectivity = async () => {
      try {
        const { ok, data, code } = await api.get(`/collectivity/${id}`);
        if (!ok) return toast.error(code || "Une erreur est survenue")
        setCollectivity(data)
      } catch (error) {
        toast.error(error || "Une erreur est survenue")
      }
    };

    const handleDelete = async () => {
      try {
        if (!confirm("Are you sure you want to delete this collectivity?")) return
        const { ok, data, code } = await api.delete(`/collectivity/${id}`);
        if (!ok) return toast.error(code || "Une erreur est survenue")
        toast.success("Collectivité supprimée !")
        navigate("/admin/collectivity")
      } catch (error) {
        toast.error(error || "Une erreur est survenue")
      }
    }

    const handleSave = async () => {
      try {
        const { ok, data, code } = await api.put(`/collectivity/${id}`, collectivity);
        if (!ok) return toast.error(code || "Une erreur est survenue")
        toast.success("Collectivité sauvegardée !")
      } catch (error) {
        toast.error(error || "Une erreur est survenue")
      }
    }

    useEffect(() => {
        getCollectivity()
    }, [id])


  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <button
            onClick={() => navigate("/admin/collectivity")}
            className="hover:text-primary-green transition-colors"
          >
            Collectivités
          </button>
          <span>/</span>
          <span className="text-gray-900 font-medium truncate max-w-[150px]">
            {collectivity.name}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-primary-green transition-colors"
            aria-label="Revenir à la page précédente"
          >
            <FiArrowLeft size={18} />
          </button>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {collectivity.name || "Détails de la collectivité"}
          </h1>
        </div>
      </div>
      
      <div className="card-shadow">

        {/* Informations générales */}
        <div className="pt-6 mt-6 border-t border-light-border">
          <h2 className="text-lg font-semibold mb-4">Informations générales</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Nom de la collectivité</label>
              <input
                type="text"
                placeholder="Nom de la collectivité"
                value={collectivity.name || ""}
                onChange={(e) => setCollectivity({...collectivity, name: e.target.value})}
                className="w-full input-primary"
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold mb-2">Population</label>
              <input
                type="number"
                value={collectivity.population || ""}
                onChange={(e) => setCollectivity({...collectivity, population: e.target.value})}
                className="w-full input-primary"  
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Département</label>
              <input
                type="number"
                value={collectivity.department || ""}
                onChange={(e) => setCollectivity({...collectivity, department: e.target.value})}
                className="w-full input-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Description</label>
              <textarea
                value={collectivity.description || ""}
                onChange={(e) => setCollectivity({...collectivity, description: e.target.value})}
                rows="4"
                className="w-full input-primary rounded-lg"
              />
            </div>
          </div>
        </div>

        <div className="pt-6 mt-6 border-t border-light-border">
        <div className="flex justify-end gap-3">
        <button
          onClick={handleDelete}
          className="button-primary bg-red-600"
        >
          Supprimer
        </button>
        <button
          onClick={handleSave}
          className="button-primary"
        >
          Enregistrer
        </button>
      </div>
        </div>
      </div>
    </div>
  );
}