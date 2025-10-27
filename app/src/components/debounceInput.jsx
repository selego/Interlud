import React, { useEffect, useState } from "react";

const DebounceInput = ({debounce = 400,value = "",onChange, ...otherProps }) => {
  const [inputValue, setInputValue] = useState(value);
  
  useEffect(() => {
    if (value === inputValue) return;
    const timeoutId = setTimeout(() => {
      onChange?.({ target: { value: inputValue } });
    }, debounce);
    return () => clearTimeout(timeoutId);
  }, [inputValue, value, onChange, debounce]);

  return <input {...otherProps} value={inputValue} onChange={(event) => setInputValue(event.target.value)} />;
};

export default DebounceInput;