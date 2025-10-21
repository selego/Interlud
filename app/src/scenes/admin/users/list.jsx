import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "@/components/modal";
import api from "@/services/api";
import toast from "react-hot-toast";

export default function List() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchUsers = async () => {
    try {
      const { data, ok, code } = await api.post("/user/search", {});
      if (!ok) return toast.error(code || "Une erreur est survenue");
      setUsers(data);
      console.log(data)
    } catch (error) {
      toast.error(error || "Une erreur est survenue");
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Liste des Utilisateurs</h1>
        <button onClick={() => setIsModalOpen(true)} className="button-primary" >
          Ajouter
        </button>
      </div>
      
      <table className="w-full overflow-hidden card-shadow">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nom</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Rôle</th>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Collectivités</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {users.map((user) => (
            <tr 
              key={user._id} 
              className="hover:bg-gray-50 cursor-pointer" 
              onClick={() => navigate(`/admin/users/${user._id}`)}
            >
              <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.name}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
              <td className="px-6 py-4 text-sm text-gray-600">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                  user.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {user.role}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {user.collectivities?.length || 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <AddUserModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}

const AddUserModal = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [name, setName] = useState("");

  const createUser = async () => {
    try {
      const { ok, data, code } = await api.post("/user/", { name, email: `${name.toLowerCase().replace(/\s/g, '')}@temp.com`, password: "Password123!" });
      if (!ok) return toast.error(code || "Une erreur est survenue");
      navigate(`/admin/users/${data._id}`);
    } catch (error) {
      toast.error(error || "Une erreur est survenue");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Ajouter un utilisateur</h2>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Nom de l'utilisateur
          </label>
          <input
            type="text"
            placeholder="Entrez le nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={createUser} className="button-primary" disabled={!name}>
            Créer
          </button>
        </div>
      </div>
    </Modal>
  );
};