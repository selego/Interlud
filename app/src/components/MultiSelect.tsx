import React, { useState, useEffect, useRef } from "react";
import { MdCheckBoxOutlineBlank, MdCheckBox } from "react-icons/md";
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";
import { HiMagnifyingGlass } from "react-icons/hi2";

interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  id: string;
  options: Option[];
  values?: string[];
  onSelectedChange: (values: string[]) => void;
  placeholder?: string;
  isSearchable?: boolean;
  className?: string;
}

const MultiSelect = ({ 
  id, 
  options, 
  values, 
  onSelectedChange, 
  placeholder = "Select an option", 
  isSearchable = false, 
  className = "" 
}: MultiSelectProps) => {
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState<string>("");

  useEffect(() => {
    if (values) {
      setSelectedValues(values);
    }
  }, [values]);

  const getLabelsFromValues = (values: string[]): string[] => {
    return values.map((value) => {
      const option = options.find((opt) => opt.value === value);
      return option ? option.label : value;
    });
  };

  const handleOptionClick = (option: Option): void => {
    let _selectedValues: string[];
    if (selectedValues.includes(option.value)) {
      _selectedValues = selectedValues.filter((value) => value !== option.value);
    } else {
      _selectedValues = [...selectedValues, option.value];
    }
    setSelectedValues(_selectedValues);
    onSelectedChange(_selectedValues);
  };

  const handleToggleClick = (): void => {
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      const target = event.target as HTMLElement;
      const idRegex = new RegExp(id);
      if (ref.current && !ref.current.contains(target) && !idRegex.test(target.id)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside, true);
    return () => {
      document.removeEventListener("click", handleClickOutside, true);
    };
  }, [id]);

  useEffect(() => {
    if (!isOpen) setSearch("");
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        id={id}
        type="button"
        onClick={handleToggleClick}
        className={`w-full inline-flex justify-between items-center gap-4 px-2 pr-1 py-2 border border-gray-200 shadow-sm text-sm rounded-md bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${className}`}
      >
        <span id={`${id}-text`} className={`flex-1 text-left ${selectedValues.length === 0 ? "text-gray-400" : "text-gray-900"}`}>
          {selectedValues.length === 0 ? placeholder : getLabelsFromValues(selectedValues).join(", ")}
        </span>
        {isOpen ? <HiChevronUp /> : <HiChevronDown />}
      </button>
      {isOpen && (
        <div ref={ref} className="absolute z-10 mt-1 max-h-96 w-full bg-white shadow-lg rounded-md overflow-y-scroll">
          <ul className="border border-gray-200 divide-y divide-gray-200 list-none w-full">
            {isSearchable && (
              <li className="flex items-center gap-1 text-sm cursor-pointer w-full p-2">
                <div className="relative rounded-md shadow-sm w-full">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <HiMagnifyingGlass className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  </div>
                  <input
                    type="text"
                    name="search"
                    value={search}
                    onChange={(e) => {
                      e.persist();
                      setSearch(e.target.value.trim());
                    }}
                    className="block w-full h-10 rounded-md border border-gray-200 !pl-10 focus:border-sky-700 md:text-sm"
                    placeholder="Rechercher..."
                  />
                </div>
              </li>
            )}
            {options
              .filter((o) => {
                if (!search) return true;
                return o.label.toLowerCase().includes(search.toLowerCase());
              })
              .map((option) => {
                const isSelected = selectedValues.includes(option.value);
                return (
                  <li key={option.value} onClick={() => handleOptionClick(option)} className="flex items-center gap-1 hover:bg-primary/10 text-sm px-2 py-1 cursor-pointer">
                    {isSelected ? <MdCheckBox className="text-primary" /> : <MdCheckBoxOutlineBlank className="text-gray-500" />}
                    <span className={`flex-1 ${isSelected ? "font-semibold" : "font-normal"}`}>{option.label}</span>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default MultiSelect;
