import React, { useState } from "react";
import { Combobox } from "@headlessui/react";
import { FiChevronDown } from "react-icons/fi";

export default ({ placeholder = "select", data, value, onChange, search = true, className = "min-w-40  max-w-52 " }) => {
  const [arr, setArr] = useState(data || []);

  function find(str) {
    const regex = new RegExp("^" + str, "i");
    const newArr = data.filter((name) => name.match(regex));
    setArr(newArr);
  }

  return (
    <Combobox value={value} onChange={onChange}>
      <div className="relative cursor-pointer space-y-3">
        <Combobox.Button className={`input text-left items-center justify-between truncate flex gap-3 ${className}`}>
          <div className="truncate">{value ? value : placeholder}</div>
          <FiChevronDown className="text-xl flex-shrink-0" aria-hidden="true" />
        </Combobox.Button>
        <Combobox.Options className="absolute top-full left-0 w-full rounded-md bg-white text-base shadow-lg ring-1 ring-black-80 ring-opacity-5 focus:outline-none z-10">
          {search && (
            <Combobox.Input
              onChange={(event) => find(event.target.value)}
              placeholder="Recherche"
              className="w-full bg-gray-50 py-2.5 px-4 border-0 focus:ring-0 focus:ring-offset-0 text-base font-bold text-black-80/80"
            />
          )}
          <div className="overflow-auto max-h-80">
            {arr.map((string) => (
              <Combobox.Option key={string} value={string}>
                {({ selected, active }) => (
                  <div className={`relative cursor-pointer select-none text-sm py-2 border-0 px-4 ${(selected || active) && "bg-gray-100"}`}>{string}</div>
                )}
              </Combobox.Option>
            ))}
          </div>
        </Combobox.Options>
      </div>
    </Combobox>
  );
};
