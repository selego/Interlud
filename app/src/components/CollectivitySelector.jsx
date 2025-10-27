import React, { useState, useEffect, useRef } from "react";
import api from "@/services/api";
import toast from "react-hot-toast";

const CollectivitySelector = ({ onSelect }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedCollectivity, setSelectedCollectivity] = useState(null);
  const dropdownRef = useRef(null);
  const [collectivities, setCollectivities] = useState([]);
  const [filters, setFilters] = useState({search: ""});

  const fetchCollectivities = async () => {
    try {
      const { ok, data, code } = await api.post("/collectivity/search", filters);
      if (!ok) return toast.error(code || "Une erreur est survenue");
      setCollectivities(data);
    } catch (error) {
      console.error("Error fetching collectivities:", error);
      toast.error("Une erreur est survenue");
    }
  };

  useEffect(() => {
    fetchCollectivities();
  }, [filters]);

  useEffect(() => {
    const handleClickOutside = (event) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target))  setIsDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedCollectivity]);

  const handleCollectivitySelect = (collectivity) => {
    setSelectedCollectivity(collectivity);
    setFilters({...filters, search: collectivity.name});
    setIsDropdownOpen(false);
    onSelect?.(collectivity);
  };

  return (
    <div ref={dropdownRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={filters.search}
          onChange={(e) => { setFilters({...filters, search: e.target.value})}}
          onFocus={() => { setIsDropdownOpen(true); setFilters({...filters, search: ""}); }}
          placeholder="Renseignez le nom et sélectionnez votre collectivité"
          className="input-primary w-full py-4 text-lg pr-10"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => {
            setIsDropdownOpen(!isDropdownOpen);
            if (!isDropdownOpen && !selectedCollectivity) {
              setFilters({...filters, search: ""});
            }
          }}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <svg 
            className={`w-5 h-5 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      
      {isDropdownOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {collectivities.length > 0 ? (
            collectivities.map((c) => (
              <div
                key={c._id}
                onClick={() => handleCollectivitySelect(c)}
                className={`px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                  selectedCollectivity?._id === c._id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-center">
                  <span className="text-gray-500 mr-2">#</span>
                  <span className="text-gray-900">{c.name}</span>
                  {selectedCollectivity?._id === c._id && (
                    <svg className="w-4 h-4 ml-auto text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-3 text-gray-500 text-center">
              Aucune collectivité trouvée
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CollectivitySelector;
