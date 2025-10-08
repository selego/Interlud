import React from "react";
import { RiErrorWarningFill, RiCheckboxCircleFill, RiInformationFill } from "react-icons/ri";

interface AlertProps {
  type?: "warning" | "success" | "error";
  title?: string;
  message?: string;
  items?: string[];
  className?: string;
}

const Alert = ({ type = "warning", title, message, items = [], className = "" }: AlertProps) => {
  const alertConfig = {
    warning: {
      bgColor: "bg-yellow-50",
      borderColor: "border-yellow-200",
      iconColor: "text-yellow-600",
      textColor: "text-yellow-600",
      icon: RiErrorWarningFill,
      defaultTitle: "Attention :",
    },
    success: {
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      iconColor: "text-green-600",
      textColor: "text-green-600",
      icon: RiCheckboxCircleFill,
      defaultTitle: "Succès :",
    },
    error: {
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      iconColor: "text-red-600",
      textColor: "text-red-600",
      icon: RiErrorWarningFill,
      defaultTitle: "Erreur :",
    },
  };

  const config = alertConfig[type] || alertConfig.warning;
  const IconComponent = config.icon;

  return (
    <div className={`rounded-lg border ${config.bgColor} ${config.borderColor} p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <IconComponent className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className={`font-medium text-sm ${config.textColor}`}>{title || config.defaultTitle}</h3>
          </div>

          {message && <p className={`text-xs ${config.textColor} mb-2`}>{message}</p>}

          {items && items.length > 0 && (
            <ul className="space-y-1 list-disc list-outside">
              {items.map((item, index) => (
                <li key={index} className={`flex items-start gap-2 text-xs ${config.textColor}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${config.iconColor.replace("text-", "bg-")} mt-2 flex-shrink-0`}></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default Alert;
