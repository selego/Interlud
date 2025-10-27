import React, { useEffect, useState } from "react";

const DebounceInput = ({ debounce = 400, isTextArea = false, ...props }) => {
  const [input, setInput] = useState(props.value);

  useEffect(() => {
    if (props.value === input) return;
    const handler = setTimeout(() => {
      props.onChange({ target: { value: input } });
    }, debounce);
    return () => clearTimeout(handler);
  }, [input]);

  return isTextArea ? (
    <textarea {...props} value={input} onChange={(e) => setInput(e.target.value)} />
  ) : (
    <input {...props} value={input} onChange={(e) => setInput(e.target.value)} />
  );
};

export default DebounceInput;
