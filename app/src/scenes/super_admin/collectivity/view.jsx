import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import api from "@/services/api"
import toast from "react-hot-toast"

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
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Détails de la collectivité</h1>
      
      <div className="flex justify-center">
        <div className="w-full max-w-2xl">
          <div className="space-y-6">
            <div className="flex gap-6">
              <div className="flex-1">
                <label className="block text-sm font-semibold mb-2">
                  Nom de la collectivité
                </label>
                <input
                  type="text"
                  placeholder="Nom de la collectivité"
                  value={collectivity.name}
                  onChange={(e) => setCollectivity({...collectivity, name: e.target.value})}
                  className="w-full input-primary"
                />
              </div>
              
              <div className="flex-1">
                <label className="block text-sm font-semibold mb-2">
                  Population
                </label>
                <input
                  type="number"
                  name="population"
                  value={collectivity.population}
                  onChange={(e) => setCollectivity({...collectivity, population: e.target.value})}
                  className="w-full input-primary"  
                />
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex-1">
                  <label className="block text-sm font-semibold mb-2">
                    Department
                  </label>
                  <input
                    type="number"
                    name="department"
                    value={collectivity.department}
                    onChange={(e) => setCollectivity({...collectivity, department: e.target.value})}
                    className="w-full input-primary"
                  />
              </div>

              <div className="flex-1">
                <label className="block text-sm font-semibold mb-2">
                  Description
                </label>
                <textarea
                  name="description"
                  value={collectivity.description}
                  onChange={(e) => setCollectivity({...collectivity, description: e.target.value})}
                  rows="4"
                  className=" w-full input-primary rounded-lg"
                />
              </div>

            </div>

            <div className="flex justify-end pt-4 gap-4">
              <button 
                onClick={handleDelete} 
                className="px-6 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors font-medium"
              >
                Supprimer
              </button>
              <button onClick={handleSave} className="button-primary">
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}