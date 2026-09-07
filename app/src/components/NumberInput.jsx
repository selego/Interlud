import React, { useEffect, useLayoutEffect, useRef, useState } from "react"

// Nettoie une saisie libre : garde les chiffres, un éventuel "-" en tête et une seule virgule (le "." est converti en ",")
const cleanRaw = (str) => {
  let s = String(str).replace(/[\s  ]/g, "").replace(/\./g, ",")
  const negative = s.startsWith("-")
  s = s.replace(/[^\d,]/g, "")
  const i = s.indexOf(",")
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, "")
  return (negative ? "-" : "") + s
}

// Ajoute un espace comme séparateur de milliers sur la partie entière : "-1234,5" -> "-1 234,5"
const formatRaw = (raw) => {
  if (raw === "" || raw === "-") return raw
  const negative = raw.startsWith("-")
  const [int, dec] = (negative ? raw.slice(1) : raw).split(",")
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  return (negative ? "-" : "") + intFormatted + (dec !== undefined ? "," + dec : "")
}

const fromValue = (value) => (value === "" || value == null ? "" : formatRaw(cleanRaw(String(value))))

const parse = (raw) => Number(raw.replace(",", "."))

// Position du curseur dans la chaîne formatée après `count` caractères significatifs (hors espaces)
const cursorAfter = (formatted, count) => {
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    if (seen === count) return i
    if (formatted[i] !== " ") seen++
  }
  return formatted.length
}

// Champ numérique avec séparateur de milliers affiché pendant la saisie.
// `value` est un nombre (ou ""), `onChange` reçoit un nombre après le délai de debounce.
export default function NumberInput({ value = "", onChange, placeholder = "", className = "", debounce = 400 }) {
  const [inputValue, setInputValue] = useState(fromValue(value))
  const inputRef = useRef(null)
  const cursorRef = useRef(null)

  useEffect(() => {
    setInputValue(fromValue(value))
  }, [value])

  useEffect(() => {
    const raw = cleanRaw(inputValue)
    const parsed = parse(raw)
    if (Number.isNaN(parsed) || parsed === value) return
    const timeoutId = setTimeout(() => onChange?.(parsed), debounce)
    return () => clearTimeout(timeoutId)
  }, [inputValue, debounce])

  useLayoutEffect(() => {
    if (cursorRef.current == null || !inputRef.current) return
    inputRef.current.setSelectionRange(cursorRef.current, cursorRef.current)
    cursorRef.current = null
  }, [inputValue])

  const handleChange = (event) => {
    const { value: domValue, selectionStart } = event.target
    const significantBefore = cleanRaw(domValue.slice(0, selectionStart ?? domValue.length)).length
    const formatted = formatRaw(cleanRaw(domValue))
    cursorRef.current = cursorAfter(formatted, significantBefore)
    setInputValue(formatted)
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      className={`input-primary ${className}`}
      placeholder={placeholder}
      value={inputValue}
      onChange={handleChange}
    />
  )
}
