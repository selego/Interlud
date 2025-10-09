import React from "react";

export default ({ loading, children, disabled, ...rest }) => (
  <button
    {...rest}
    disabled={loading || disabled}
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      opacity: disabled || loading ? 0.7 : 1,
      cursor: disabled || loading ? "not-allowed" : "pointer",
    }}
  >
    <div className="flex gap-3 items-center">
      {children}
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
