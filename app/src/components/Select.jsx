import React, { useState, useRef, useEffect } from "react"
import { FiChevronDown, FiCheck } from "react-icons/fi"

const Select = ({ options = [], value = "", onChange, className = "", placeholder = "Sélectionner", constrained = false, selectedLabel = null }) => {
  const [isOpen, setIsOpen] = useState(false)
  const selectRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectRef.current && !selectRef.current.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div ref={selectRef} className="relative">
      <div className="relative">
        <button type="button" onClick={() => setIsOpen(!isOpen)} className={`input-primary w-full text-left pr-10 ${className}`}>
          <span className="block truncate">{value ? selectedLabel || options.find((option) => option.value === value)?.label : placeholder}</span>
        </button>

        <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
          <FiChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </div>

      {isOpen && (
        <div
          className={`absolute z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto ${
            constrained ? "w-full" : "w-max min-w-full left-1/2 -translate-x-1/2"
          }`}
        >
          {options.length > 0 ? (
            options.map((option) => (
              <div
                key={option.value}
                onClick={() => {
                  onChange?.(option.value)
                  setIsOpen(false)
                }}
                className={`px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50
                  ${value === option.value ? "bg-primary/10 text-primary" : "text-gray-900"}
                `}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs ${constrained ? "truncate" : "whitespace-nowrap"}`}>{option.label}</span>
                  {value === option.value && <FiCheck className="w-4 h-4 text-primary flex-shrink-0" />}
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-3 text-gray-500 text-sm text-center">Aucune option disponible</div>
          )}
        </div>
      )}
    </div>
  )
}

export default Select
