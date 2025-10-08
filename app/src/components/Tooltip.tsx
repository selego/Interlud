import React from "react";
import { Tooltip } from "react-tooltip";
import { ImInfo } from "react-icons/im";

interface TooltipComponentProps {
  id: string;
  description: string;
  iconClass?: string;
  Icon?: React.ComponentType<{ className: string }>;
}

const TooltipComponent = ({ id, description, iconClass = "text-black", Icon }: TooltipComponentProps) => {
  return (
    <div className="inline align-middle p-[1px]">
      <Tooltip id={id} className="max-w-sm shadow-md keepOpacity" variant="light">
        <p className="text-sm leading-normal bg-white font-medium">{description}</p>
      </Tooltip>
      <span data-tooltip-id={id}>{Icon ? <Icon className={`${iconClass} text-base cursor-pointer`} /> : <ImInfo className={`${iconClass} text-base cursor-pointer`} />}</span>
    </div>
  );
};

export default TooltipComponent;