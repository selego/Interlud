import React, { useEffect, useState } from "react";

const DebounceInput = ({
  debounce = 400,
  value = "",
  onChange,
  placeholder = "",
  className = "",
  type = "text",
  rows,
}) => {
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    if (value === inputValue) return;
    const timeoutId = setTimeout(() => {
      onChange?.({ target: { value: inputValue } });
    }, debounce);
    return () => clearTimeout(timeoutId);
  }, [inputValue, debounce]);

  if (type === "textarea") {
    return (
      <textarea
        className={`input-primary ${className}`}
        placeholder={placeholder}
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        rows={rows}
      />
    );
  }

  return (
    <input
      type={type}
      className={`input-primary ${className}`}
      placeholder={placeholder}
      value={inputValue}
      onChange={(event) => setInputValue(event.target.value)}
      {...(type === "number" && {
        min: 0,
        onWheel: (e) => e.target.blur(),
        onKeyDown: (e) => { if (e.key === "-" || e.key === "e") e.preventDefault(); },
      })}
    />
  );
};

export default DebounceInput;