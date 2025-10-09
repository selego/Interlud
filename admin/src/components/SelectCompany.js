import React, { useEffect, useState } from "react";
import api from "../services/api";

export default ({ value, companyName, onChange, disabled = false, placeholder = "All companies", name = new Date().getTime() }) => {
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState(companyName ?? "");

  useEffect(() => {
    searchCompanies();
  }, [search]);

  async function searchCompanies() {
    const { data, ok } = await api.post("/company/search", { search });
    if (!ok) return;
    setCompanies(data);
  }

  return (
    <div>
      <div>
        <input
          list={name}
          value={search}
          disabled={disabled}
          className="block w-full py-2 px-3 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          placeholder={placeholder}
          onChange={(e) => {
            setSearch(e.target.value);
            if (e.target.value === "all") {
              return onChange();
            }
            const f = companies.find((f) => e.target.value === f.name);
            if (f) onChange(f);
            if (!e.target.value) onChange({});
          }}
        />
        <datalist
          id={name}
          name={name}
          className="w-[180px] bg-[#FFFFFF] text-[12px] text-[#212325] font-semibold py-[4px] px-[4px] rounded-[5px] border-r-[16px] border-[transparent] cursor-pointer shadow-sm"
          value={value && value.name}
          defaultValue=""
        >
          <option value="" disabled>
            Select company
          </option>
          {companies

            .sort(function (a, b) {
              if (a.name?.toLowerCase() < b.name?.toLowerCase()) return -1;
              if (a.name?.toLowerCase() > b.name?.toLowerCase()) return 1;
              return 0;
            })
            .map((e) => (
              <option key={e._id} value={e.name} />
            ))}
        </datalist>
      </div>
    </div>
  );
};
