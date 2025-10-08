import React, { useRef } from "react";
// @ts-ignore
import SunEditor from "suneditor-react";
import "suneditor/dist/css/suneditor.min.css";

interface TextEditorProps {
  value?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
  className?: string;
}

const TextEditor = ({ value, onChange, placeholder, className }: TextEditorProps) => {
  const editorRef = useRef<any>(null);

  const handleChange = (content: string) => onChange && onChange(content);

  return (
    <div className={className}>
      <SunEditor
        ref={editorRef}
        setOptions={{
          height: 200,
          buttonList: [
            // ["font", "bold", "italic", "underline", "strike"],
            // ["fontColor", "hiliteColor", "align", "list", "link"],
            // ["image", "video"],
          ],
          font: ["Poppins"],
          defaultStyle: "font-family: Poppins; font-size: 14px;",
          placeholder: placeholder || "",
        }}
        onChange={handleChange}
        setContents={value}
      />
    </div>
  );
};

export default TextEditor;
