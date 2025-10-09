import React from "react"

export default ({ title, active, Icon, onClick }) => (
  <button
    onClick={onClick}
    className={`group inline-flex items-center px-4 py-2 cursor-pointer text-sm text-gray-400 hover:border-primary hover:text-primary border-b-2 ${
      active ? "text-primary  border-primary" : "border-transparent"
    }`}
  >
    {Icon ? <Icon className={`${active ? "text-primary" : "text-gray-400 group-hover:text-gray-500"} -ml-0.5 mr-2 h-4 w-4`} aria-hidden="true" /> : null}
    <div className="flex items-center gap-2">{title}</div>
  </button>
)
