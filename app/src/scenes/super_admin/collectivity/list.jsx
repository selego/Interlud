import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import Modal from "@/components/modal"

export default function List() {
  const navigate = useNavigate()
  const [collectivities, setCollectivities] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchCollectivities = () => {
    setCollectivities([
      { id: 1, name: "Collectivité de Paris", date: "2024-03-15", description: "Gestion urbaine et services publics locaux" },
      { id: 2, name: "Métropole de Lyon", date: "2024-02-28", description: "Transition écologique et développement durable" },
      { id: 3, name: "Communauté de Marseille", date: "2024-01-20", description: "Innovation maritime et développement portuaire" },
      { id: 4, name: "Ville de Toulouse", date: "2024-04-10", description: "Dynamisme aéronautique et qualité de vie" },
      { id: 5, name: "Région de Bordeaux", date: "2023-12-05", description: "Préservation du patrimoine culturel" },
      { id: 6, name: "Communauté de Nantes", date: "2024-05-22", description: "Urbanisme participatif" },
      { id: 7, name: "Collectivité de Strasbourg", date: "2024-03-08", description: "Coopération transfrontalière" },
      { id: 8, name: "Métropole de Lille", date: "2024-02-14", description: "Territoire en transformation" }
    ])
  };

  useEffect(() => {
    fetchCollectivities()
  }, [])

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Liste des Collectivités</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="button-primary"
        >
          Ajouter
        </button>
      </div>
      
      <table className="w-full bg-white shadow-md rounded-lg overflow-hidden">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nom</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {collectivities.map((collectivity) => (
            <tr key={collectivity.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/admin/collectivity/${collectivity.id}`)}>
              <td className="px-6 py-4 text-sm font-medium text-gray-900">{collectivity.name}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{collectivity.date}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{collectivity.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <AddCollectivityModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  )
}


const AddCollectivityModal = ({ isOpen, onClose }) => {
    const navigate = useNavigate()
    const [name, setName] = useState("")

    const createCollectivity = () => {
        console.log("Creating collectivity", name)
        navigate(`/admin/collectivity/1`)
    }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Ajouter une collectivité</h2>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Nom de la collectivité
          </label>
          <input
            type="text"
            placeholder="Entrez le nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-green focus:border-transparent transition-all"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={createCollectivity} className="button-primary">
            Créer
          </button>
        </div>
      </div>
    </Modal>
  )
}