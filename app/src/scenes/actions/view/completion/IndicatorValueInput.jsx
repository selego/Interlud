import React from "react";
import DebounceInput from "@/components/debounceInput";

export default function IndicatorValueInput({ value, indicatorType, options, onChange }) {
  if (indicatorType === "text" || indicatorType === undefined) {
    return (
      <DebounceInput
        type="text"
        placeholder="Valeur texte"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        debounce={800}
      />
    );
  }

  if (indicatorType === "number") {
    return (
      <DebounceInput
        type="number"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Valeur numérique"
        debounce={800}
      />
    );
  }

  if (indicatorType === "radio") {
    return (
      <div className="space-y-2">
        {options?.map((option, index) => (
          <label key={index} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              value={option}
              checked={value === option}
              onChange={(e) => onChange(e.target.value)}
              className="text-primary-green focus:ring-primary-green focus:ring-2 focus:ring-primary-green/20"
              style={{ accentColor: "primary-green" }}
            />
            <span className="text-sm text-gray-700">{option}</span>
          </label>
        ))}
      </div>
    );
  }

  if (indicatorType === "checkbox") {
    const selectedValues = value && typeof value === "string" ? value.split(",").filter(v => v.trim()) : [];

    const handleCheckboxChange = (option, isChecked) => {
      const newValues = isChecked
        ? [...selectedValues, option].join(",")
        : selectedValues.filter(v => v !== option).join(",");
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
              className="text-primary-green focus:ring-primary-green focus:ring-2 focus:ring-primary-green/20 rounded"
              style={{ accentColor: "primary-green" }}
            />
            <span className="text-sm text-gray-700">{option}</span>
          </label>
        ))}
      </div>
    );
  }

  return null;
}
