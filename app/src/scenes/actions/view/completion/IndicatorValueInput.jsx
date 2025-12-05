import React, { useState } from "react";
import DebounceInput from "@/components/debounceInput";
import Select from "@/components/Select";

export default function IndicatorValueInput({ value, indicatorType, options, onChange }) {
  if (indicatorType === "text" || indicatorType === undefined) {
    return (
      <DebounceInput
        type="text"
        placeholder="Valeur texte"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        debounce={800}
        className="text-gray-900 font-bold"
      />
    );
  }

  if (indicatorType === "number") {
    return (
      <DebounceInput
        type="number"
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value))}
        placeholder="Valeur numérique"
        debounce={800}
        className="text-gray-900 font-bold"
      />
    );
  }

  if (indicatorType === "radio") {
    if (options?.some(opt => opt.length > 30) || options?.length > 3) {
      return (
        <Select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          options={options?.map(opt => ({ value: opt, label: opt })) || []}
          placeholder="Sélectionner une option"
          className="text-gray-900 font-bold"
        />
      );
    }

    return (
      <div className="inline-flex rounded-full border border-secondary-green bg-secondary-green/30 w-fit">
        {options?.map((option, index) => {          
          return (
            <label
              key={index}
              className={`
                relative flex items-center justify-center px-4 py-2 cursor-pointer transition-all
                ${value === option ? "bg-primary-green text-white font-medium"  : "bg-transparent text-gray-400"}
                ${index === 0 ? "rounded-l-full" : ""}
                ${index === options.length - 1 ? "rounded-r-full" : ""}
              `}
            >
              <input
                type="radio"
                value={option}
                checked={value === option}
                onChange={(e) => onChange(e.target.value)}
                className="sr-only"
              />
              <span className="text-sm whitespace-nowrap">{option}</span>
            </label>
          );
        })}
      </div>
    );
  }

  if (indicatorType === "checkbox") {
    const selectedValues = Array.isArray(value) ? value : [];
    const [showAll, setShowAll] = useState(false);
    const visibleOptions = options && options.length > 5 && !showAll ? options.slice(0, 5) : options;

    const handleCheckboxChange = (option, isChecked) => {
      const newValues = isChecked ? [...selectedValues, option] : selectedValues.filter(v => v !== option);
      onChange(newValues);
    };

    return (
      <div className="space-y-2">
        {visibleOptions?.map((option, index) => (
          <label key={index} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              value={option}
              checked={selectedValues.includes(option)}
              onChange={(e) => handleCheckboxChange(option, e.target.checked)}
              className="w-4 h-4"
              style={{ accentColor: "#2DAC6A" }}
            />
            <span className="text-sm text-gray-700">{option}</span>
          </label>
        ))}
        {options && options.length > 5 && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="text-sm text-primary-green hover:text-primary-green/80 font-medium mt-2"
          >
            {showAll ? "Voir moins" : `Voir plus (${options.length - 5} autres)`}
          </button>
        )}
      </div>
    );
  }

  return null;
}
