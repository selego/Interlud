import React from "react";

interface LoaderProps {
  size?: "small" | "default";
}

const Loader = ({ size }: LoaderProps) => {
  if (size === "small") {
    return (
      <div className="flex items-center justify-center space-x-2">
        <div
          className="w-4 h-4 rounded-full animate-spin"
          style={{
            background: `conic-gradient(from 0deg, #227ADB, #DC97B6, #227ADB)`,
            mask: "radial-gradient(farthest-side, transparent calc(100% - 6px), white calc(100% - 6px))",
            WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 6px), white calc(100% - 6px))",
          }}
          role="status"
        >
          <span className="hidden">Loading...</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center space-x-2">
      <div
        className="w-12 h-12 rounded-full animate-spin"
        style={{
          background: `conic-gradient(from 0deg, #227ADB, #DC97B6, #227ADB)`,
          mask: "radial-gradient(farthest-side, transparent calc(100% - 6px), white calc(100% - 6px))",
          WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 6px), white calc(100% - 6px))",
        }}
        role="status"
      >
        <span className="hidden">Loading...</span>
      </div>
    </div>
  );
};

export default Loader;
