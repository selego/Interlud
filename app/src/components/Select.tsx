import React from "react";
import { Listbox } from "@headlessui/react";
import { FaAngleDown } from "react-icons/fa6";
import { FiCheck } from "react-icons/fi";

interface Option {
  value: string | boolean | number;
  label: string;
}

interface SelectProps {
  value: string | boolean | number | null;
  onChange: (value: string | boolean | number) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const Select = ({ 
  value, 
  onChange, 
  options, 
  placeholder, 
  className, 
  disabled = false 
}: SelectProps) => {
  const translate = (val: string | number | boolean | null): string => {
    if (val === null) return '';
    const stringVal = String(val);
    switch (stringVal) {
      case "true":
        return "Yes";
      case "false":
        return "No";
      default:
        return stringVal;
    }
  };

  const getLabel = (val: string | number | boolean | null): string => {
    if (val === null) return '';
    const matchingOption = options.find((option) => option.value === val);
    if (matchingOption) {
      return matchingOption.label;
    }
    return String(val);
  };

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className="relative w-full">
        <Listbox.Button
          className={`w-full text-left text-sm px-2 py-2 font-normal border border-gray-200 rounded-md bg-white focus:outline-none ${
            value ? "text-gray-900" : "text-gray-400"
          } ${className} ${disabled ? "opacity-50 cursor-not-allowed bg-gray-50" : "hover:bg-gray-50"}`}
        >
          {value ? translate(getLabel(value)) : placeholder}
          <FaAngleDown className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
        </Listbox.Button>
        {!disabled && (
          <Listbox.Options className="absolute max-h-40 scrollbar-float z-10 w-full mt-1 bg-white border border-gray-200 rounded-md text-sm overflow-y-auto">
            {options.map((option) => (
              <Listbox.Option
                key={String(option.value)}
                value={option.value}
                className={({ active, selected }) =>
                  `cursor-pointer select-none px-2 py-1 hover:bg-primary/10 ${active ? "bg-gray-100" : ""} ${selected ? "font-semibold bg-primary/80" : "font-normal"}`
                }
              >
                {({ selected }) => (
                  <div className="flex justify-between items-center">
                    <span>{option.label}</span>
                    {selected && <FiCheck className="w-4 h-4 text-gray-900" aria-hidden="true" />}
                  </div>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        )}
      </div>
    </Listbox>
  );
};

export default Select;
