import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";

import Loader from "../../components/Loader";
import SearchBar from "../../components/SearchBar";
import Pagination from "../../components/Pagination";

import api from "../../services/api";
import { APP_URL } from "../../config";

export default () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [users, setUsers] = useState();
  const [filter, setFilter] = useState({
    search: "",
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState();
  const handleNextPage = () => setCurrentPage((prev) => prev + 1);
  const handlePreviousPage = () => setCurrentPage((prev) => prev - 1);

  useEffect(() => {
    getUsers();
    setCurrentPage(1);
  }, [filter, location]);

  useEffect(() => {
    getUsers();
  }, [currentPage]);

  const getUsers = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const organisation_id = urlParams.get("organisation_id");

    try {
      const { data, ok, total } = await api.post("/admin/user/search", {
        search: filter.search,
        offset: (currentPage - 1) * 10,
        organisation_id,
      });
      if (!ok) return toast.error(data.message);
      setUsers(data);
      setTotal(total);
    } catch (error) {
      console.log(error);
    }
  };

  if (!users) return <Loader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-6 w-full justify-between">
          <SearchBar search={filter.search} setFilter={setFilter} />
        </div>
      </div>

      <div className="flow-root">
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full align-middle">
            <div className="overflow-hidden border shadow-md rounded-lg bg-gray-50">
              <table className="min-w-[600px] w-full divide-y divide-primary-black-50 rounded-lg overflow-hidden">
                <thead>
                  <tr>
                    <th className="p-3 text-left font-medium text-xs lg:text-sm">Nom</th>
                    <th className="p-3 text-left font-medium text-xs lg:text-sm">E-mail</th>
                    <th className="p-3 text-left font-medium text-xs lg:text-sm">Dernière connexion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-black-50 bg-gray-50">
                  {users.map((user, i) => (
                    <tr key={i} className="cursor-pointer hover:bg-gray-100" onClick={() => navigate(`/user/${user._id}`)}>
                      <td className="p-3 text-xs lg:text-sm text-primary-black-90">{user.name}</td>
                      <td className="p-3 text-xs lg:text-sm text-primary-black-90">{user.email}</td>
                      <td className="p-3 text-xs lg:text-sm text-primary-black-90">{(user.last_login_at || "").slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <Pagination total={total} currentPage={currentPage} onNext={handleNextPage} onPrevious={handlePreviousPage} />
    </div>
  );
};
