import React, { useState, useEffect, useRef } from "react";
import { MdCheckBoxOutlineBlank, MdCheckBox } from "react-icons/md";
import { HiChevronDown, HiChevronUp, HiChevronRight } from "react-icons/hi2";
import { HiMagnifyingGlass } from "react-icons/hi2";

interface HierarchicalMultiSelectProps {
  id: string;
  options: any[];
  values?: string[];
  onSelectedChange: (values: string[]) => void;
  placeholder?: string;
  isSearchable?: boolean;
  className?: string;
}

function HierarchicalMultiSelect({ id, options, values, onSelectedChange, placeholder = "Sélectionner une option", isSearchable = false, className = "" }: HierarchicalMultiSelectProps) {
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (values) {
      setSelectedValues(values);
    }
  }, [values]);

  const getLabelsFromValues = (values: string[]) => {
    const labels: string[] = [];
    values.forEach((value) => {
      options.forEach((category) => {
        const subOption = category.children?.find((opt: any) => opt.value === value);
        if (subOption) {
          labels.push(`${subOption.label}`);
        }
      });
    });
    return labels;
  };

  function handleCategoryClick(category: any) {
    if (selectedCategory?.value === category.value) {
      setSelectedCategory(null);
    } else {  
      setSelectedCategory(category);
    }
  }

  function handleSubOptionClick(subOption: any) {
    let _selectedValues;
    if (selectedValues.includes(subOption.value)) {
      _selectedValues = selectedValues.filter((value) => value !== subOption.value);
    } else {
      _selectedValues = [...selectedValues, subOption.value];
    }
    setSelectedValues(_selectedValues);
    onSelectedChange(_selectedValues);
  }

  function handleToggleClick() {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setSelectedCategory(null);
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const idRegex = new RegExp(id);
      const target = event.target as HTMLElement;
      if (ref.current && !ref.current.contains(target) && !idRegex.test(target.id)) {
        setIsOpen(false);
        setSelectedCategory(null);
      }
    };
    document.addEventListener("click", handleClickOutside, true);
    return () => {
      document.removeEventListener("click", handleClickOutside, true);
    };
  }, [id]);

  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      setSelectedCategory(null);
    }
  }, [isOpen]);

  const getSelectedCountForCategory = (category: any) => {
    if (!category.children) return 0;
    return category.children.filter((child: any) => selectedValues.includes(child.value)).length;
  };

  const filteredOptions = options.filter((category) => {
    if (!search) return true;
    const categoryMatches = category.label.toLowerCase().includes(search.toLowerCase());
    const childrenMatch = category.children?.some((child: any) => child.label.toLowerCase().includes(search.toLowerCase()));
    return categoryMatches || childrenMatch;
  });

  const filteredSubOptions =
    selectedCategory?.children?.filter((subOption: any) => {
      if (!search) return true;
      return subOption.label.toLowerCase().includes(search.toLowerCase());
    }) || [];

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
        <div ref={ref} className="absolute z-10 mt-1 max-h-96 w-full bg-white shadow-lg rounded-md overflow-hidden">
          <div className="border border-gray-200">
            {/* Barre de recherche */}
            {isSearchable && (
              <div className="flex items-center gap-1 text-sm w-full p-2 border-b border-gray-200">
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
              </div>
            )}

            <div className="max-h-80 overflow-y-auto">
              {/* Niveau 1 : Catégories principales */}
              <ul className="divide-y divide-gray-200 list-none w-full">
                {filteredOptions.map((category) => (
                  <li key={category.value}>
                    <div
                      onClick={() => handleCategoryClick(category)}
                      className={`flex items-center justify-between gap-2 hover:bg-gray-50 text-sm px-3 py-2 cursor-pointer ${
                        selectedCategory?.value === category.value ? "bg-gray-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{category.label}</span>
                        {getSelectedCountForCategory(category) > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/80 text-white">
                            {getSelectedCountForCategory(category)}
                          </span>
                        )}
                      </div>
                      <HiChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${selectedCategory?.value === category.value ? "rotate-90" : ""}`} />
                    </div>

                    {/* Niveau 2 : Sous-options */}
                    {selectedCategory?.value === category.value && (
                      <ul className="bg-gray-25 border-t border-gray-100">
                        {filteredSubOptions.map((subOption: any) => {
                          const isSelected = selectedValues.includes(subOption.value);
                          return (
                            <li
                              key={subOption.value}
                              onClick={() => handleSubOptionClick(subOption)}
                              className="flex items-center gap-2 hover:bg-primary/10 text-sm px-6 py-2 cursor-pointer"
                            >
                              {isSelected ? <MdCheckBox className="text-primary" /> : <MdCheckBoxOutlineBlank className="text-gray-500" />}
                              <span className={`flex-1 ${isSelected ? "font-semibold text-primary" : "font-normal"}`}>{subOption.label}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HierarchicalMultiSelect;