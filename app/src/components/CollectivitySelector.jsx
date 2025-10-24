import React, { useState, useEffect, useRef } from "react";

const CollectivitySelector = ({  collectivities = [],  onSelect }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [filteredCollectivities, setFilteredCollectivities] = useState([]);
  const [selectedCollectivity, setSelectedCollectivity] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    setFilteredCollectivities(collectivities.filter(c =>  c.name.toLowerCase().includes(searchTerm.toLowerCase())));
    if (searchTerm.trim() === "" || !isSearching) setFilteredCollectivities(collectivities);
  }, [searchTerm, collectivities, isSearching]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
        setIsSearching(false);
        if (selectedCollectivity) setSearchTerm(selectedCollectivity.name); else setSearchTerm("");
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedCollectivity]);

  const handleCollectivitySelect = (collectivity) => {
    setSelectedCollectivity(collectivity);
    setSearchTerm(collectivity.name);
    setIsDropdownOpen(false);
    setIsSearching(false);
    onSelect?.(collectivity);
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setIsSearching(true);
    setIsDropdownOpen(true);
    if (e.target.value === "") setSelectedCollectivity(null); onSelect?.(null);
  };

  return (
    <div ref={dropdownRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={handleSearchChange}
          onFocus={() => { setIsDropdownOpen(true); setIsSearching(true); setSearchTerm(""); }}
          placeholder="Renseignez le nom et sélectionnez votre collectivité"
          className="input-primary w-full py-4 text-lg pr-10"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => {
            setIsDropdownOpen(!isDropdownOpen);
            if (!isDropdownOpen) {
              setIsSearching(true);
              setSearchTerm("");
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
          {filteredCollectivities.length > 0 ? (
            filteredCollectivities.map((c) => (
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
