import React, { useState } from "react";
import TagsInput from "react-tagsinput";
import "react-tagsinput/react-tagsinput.css";
import { IoIosClose } from "react-icons/io";

const MultipleSelectInput = ({ value, label = "", placeholder = "", onChange }) => {
  const [inputValue, setInputValue] = useState("");

  React.useEffect(() => {
    setInputValue("");
  }, [value]);

  return (
    <div className="w-full">
      <div className="px-1 text-sm text-gray-600 font-medium">{label}</div>
      <div className="relative mt-2 w-full">
        <TagsInput
          className="text-sm rounded-large block w-full"
          inputProps={{ placeholder: placeholder, className: "!py-2.5" }}
          renderLayout={(tagComponents, inputComponent) => (
            <div className="flex flex-col gap-2">
              <div className="rounded-lg">{inputComponent}</div>
              <div className="flex gap-1 flex-wrap border rounded-md mt-4 min-h-20 p-3">{tagComponents}</div>
            </div>
          )}
          renderTag={({ tag, key }) => (
            <span
              key={key}
              className="px-3 py-1 bg-shade-blue text-primary text-xs font-medium rounded-md flex align-center items-center w-max transition duration-300 ease border h-fit"
            >
              {tag}
              <button onClick={() => onChange(value.filter((e) => e !== tag))} className="bg-transparent hover focus:outline-none ml-2 font-bold">
                <IoIosClose className="h-5 w-5" />
              </button>
            </span>
          )}
          value={value}
          onChange={onChange}
          inputValue={inputValue}
          onChangeInput={setInputValue}
        />
      </div>
    </div>
  );
};

export default MultipleSelectInput;
