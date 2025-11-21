import React from "react";
import DebounceInput from "@/components/debounceInput";
import Select from "@/components/Select";

export default function IndicatorValueInput({ value, indicatorType, options, onChange }) {
  if((indicatorType === "text" || indicatorType === "number") && options.length !== 0) {
    return (
      <Select
        value={value || ""}
        onChange={(option) => onChange(option)}
        options={options.map((option) => ({
          value: option,
          label: option,
        }))}
        className="text-gray-900 font-bold"
      />
    );
  }

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
    const selectedValue = Array.isArray(value) ? value[0] : value;
    
    return (
      <div className="inline-flex rounded-full border border-secondary-green bg-secondary-green/30 w-fit">
        {options?.map((option, index) => {
          const isSelected = selectedValue === option;
          const isFirst = index === 0;
          const isLast = index === options.length - 1;
          
          return (
            <label
              key={index}
              className={`
                relative flex items-center justify-center px-4 py-2 cursor-pointer transition-all
                ${isSelected 
                  ? "bg-primary-green text-white font-medium" 
                  : "bg-transparent text-gray-400"
                }
                ${isFirst ? "rounded-l-full" : ""}
                ${isLast ? "rounded-r-full" : ""}
              `}
            >
              <input
                type="radio"
                value={option}
                checked={isSelected}
                onChange={(e) => onChange([e.target.value])}
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

    const handleCheckboxChange = (option, isChecked) => {
      const newValues = isChecked ? [...selectedValues, option] : selectedValues.filter(v => v !== option);
      onChange(newValues);
    };

    return (
      <div className="space-y-2">
        {options?.map((option, index) => (
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
      </div>
      
    );
  }

  return null;
}
