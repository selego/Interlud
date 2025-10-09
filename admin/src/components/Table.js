import { IoIosArrowDown, IoIosArrowUp } from "react-icons/io";
import Loader from "./Loader";

const Table = ({ header, sort, total, onSort, loading, children, fixed = false, sticky = false, height = "h-full", width = null }) => {
  if (total === 0 && !loading) return;
  return (
    <div className={`w-full border rounded-lg overflow-x-auto ${height}`}>
      <table className={`w-full  min-w-[900px]  ${fixed ? "table-fixed" : ""}`}>
        <thead className={`text-left ${sticky ? "sticky top-0 z-10 bg-gray-50 shadow-md" : ""}`}>
          <tr className="border-b">
            {header.map((item, index) => (
              <th
                key={index}
                className={`p-2 py-3 whitespace-nowrap ${item.key && "bg-gray-50 hover:bg-gray-100 cursor-pointer"} ${item.width ? item.width : ""}`}
                colSpan={item.colSpan || 1}
                onClick={() => {
                  item.key && onSort(item.key);
                }}
              >
                <div
                  className={`flex items-center gap-3
                   ${
                     item.position === "right" ? "justify-end" : item.position === "center" ? "justify-center" : item.position === "between" ? "justify-between" : "justify-start"
                   }`}
                >
                  <h3 className="text-sm font-medium">{item.title}</h3>
                  {item.key && (
                    <button className="flex flex-col justify-center">
                      {sort[item.key] === 1 ? <IoIosArrowUp /> : sort[item.key] === -1 ? <IoIosArrowDown /> : <IoIosArrowDown className=" opacity-0" />}
                    </button>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="relative divide-y">{total === 0 && !loading ? <div className="w-full text-sm text-gray-600">No data found</div> : loading ? <Loader /> : children}</tbody>
      </table>
    </div>
  );
};

export default Table;
