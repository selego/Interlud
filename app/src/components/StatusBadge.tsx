import React, { ReactNode } from "react";

interface StatusConfig {
  text: string;
  borderColor: string;
  textColor: string;
  icon: ReactNode;
}

interface StatusBadgeProps {
  status: string | null;
  className?: string;
}

const StatusBadge = ({ status, className = "" }: StatusBadgeProps) => {
  const getStatusConfig = (status: string | null): StatusConfig => {
    switch (status?.toLowerCase()) {
      case "verified":
        return {
          text: "Verified",
          borderColor: "border-primary",
          textColor: "text-primary",
          icon: (
            <div className="w-4 h-4 bg-primary rounded-sm flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          ),
        };
      case "pending":
        return {
          text: "Pending",
          borderColor: "border-pink",
          textColor: "text-pink",
          icon: <div className="w-2 h-2 bg-pink rounded-full"></div>,
        };
      case "rejected":
        return {
          text: "Rejected",
          borderColor: "border-gray-400",
          textColor: "text-gray-400",
          icon: <div className="w-2 h-2 bg-gray-400 rounded-full"></div>,
        };
      default:
        return {
          text: status || "Unknown",
          borderColor: "border-gray-400",
          textColor: "text-gray-400",
          icon: <div className="w-2 h-2 bg-gray-400 rounded-full"></div>,
        };
    }
  };

  const config = getStatusConfig(status);

  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${config.borderColor} ${config.textColor} border ${className}`}>
      {config.icon}
      {config.text}
    </span>
  );
};

export default StatusBadge;
