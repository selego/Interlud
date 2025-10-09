import React from "react";
import { HiMagnifyingGlass } from "react-icons/hi2";

export default function SearchBar({ search, setFilter, placeholder = "Search" }) {
  const handleChange = (e) => {
    e.persist();
    setFilter((f) => ({ ...f, search: e.target.value, page: 1 }));
  };
  return (
    <div className="relative rounded-md shadow-sm w-1/3">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <HiMagnifyingGlass className="h-5 w-5 text-gray-400" aria-hidden="true" />
      </div>
      <input
        type="text"
        name="search"
        value={search}
        onChange={handleChange}
        className="block w-full h-10 rounded-md border border-gray-300 !pl-10 focus:border-sky-700 md:text-sm"
        placeholder={placeholder}
      />
    </div>
  );
}
