import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";

export default function View() {
    const {id} = useParams()
    const [collectivity, setCollectivity] = useState({ name: "", date: "", description: "" });

    const getCollectivity = async () => {
      const data = { id: 1, name: "Collectivité de Paris", date: "2024-03-15", description: "Gestion urbaine et services publics locaux" }
      setCollectivity(data);
    };

    useEffect(() => {
        getCollectivity()
    }, [id])

    const handleSave = () => {
      console.log("Saving collectivity:", collectivity);
      alert("Collectivité sauvegardée !");
    };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Détails de la collectivité</h1>
      
      <div className="flex justify-center">
        <div className="w-full max-w-2xl">
          <div className="space-y-6">
            <div className="flex gap-6">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Nom de la collectivité
                </label>
                <input
                  type="text"
                  placeholder="Nom de la collectivité"
                  value={collectivity.name}
                  onChange={(e) => setCollectivity({...collectivity, name: e.target.value})}
                  className="w-full pl-4 pr-4 py-2 border border-secondary-green bg-deco-background-green rounded-full text-sm"
                />
              </div>
              
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Date
                </label>
                <input
                  type="date"
                  name="date"
                  value={collectivity.date}
                  onChange={(e) => setCollectivity({...collectivity, date: e.target.value})}
                  className="w-full pl-4 pr-4 py-2 border border-secondary-green bg-deco-background-green rounded-full text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Description
              </label>
              <textarea
                name="description"
                value={collectivity.description}
                onChange={(e) => setCollectivity({...collectivity, description: e.target.value})}
                rows="4"
                className="w-full pl-4 pr-4 py-2 border border-secondary-green bg-deco-background-green rounded-lg text-sm"
              />
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={handleSave}
                className="px-6 py-3 rounded-full bg-primary-green hover:bg-green-700 text-white text-base font-medium transition-colors"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}