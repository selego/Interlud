import React, { ButtonHTMLAttributes, ReactNode } from "react";

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

const LoadingButton = ({ loading, children, disabled, className = "", ...rest }: LoadingButtonProps) => (
  <button
    {...rest}
    disabled={loading || disabled}
    className={`px-4 py-2.5 border-2 text-primary text-sm font-bold hover:bg-primary-light transition-colors rounded-md ${className}`}
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      opacity: disabled || loading ? 0.7 : 1,
      cursor: disabled || loading ? "not-allowed" : "pointer",
      background: "linear-gradient(white, white) padding-box, linear-gradient(to right, #227ADB, #DC97B6) border-box",
      border: "2px solid transparent",
    }}
  >
    <div className="flex gap-3 items-center">
      {children}
      <span className="inline-block w-2 h-2 bg-pink rounded-full ml-1"></span>
      {loading && (
        <div className="flex justify-center items-center">
          <div className="spinner-border animate-spin inline-block w-3 h-3 border-[0.2em] rounded-full" role="status">
            <span className="hidden">Loading...</span>
          </div>
        </div>
      )}
    </div>
  </button>
);

export default LoadingButton;
