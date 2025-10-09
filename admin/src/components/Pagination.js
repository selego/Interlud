import React from "react";
import { IoIosArrowBack, IoIosArrowForward } from "react-icons/io";

export default function Pagination({ total, per_page = 10, currentPage = 1, onNext = () => {}, onPrevious = () => {} }) {
  const totalPages = Math.ceil(total / per_page);

  return total > 0 ? (
    <div className="flex justify-between">
      <div className="rounded-md shadow-sm bg-white text-gray-900 ring-1 ring-inset ring-gray-300 px-4 py-2">
        {currentPage} / {totalPages}
      </div>

      <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm ml-auto bg-white" aria-label="Pagination">
        <button
          disabled={currentPage <= 1}
          onClick={onPrevious}
          className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
        >
          <IoIosArrowBack className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0">
          {currentPage}
        </span>

        <button
          disabled={currentPage * per_page >= total}
          onClick={onNext}
          className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
        >
          <IoIosArrowForward className="h-5 w-5" aria-hidden="true" />
        </button>
      </nav>
    </div>
  ) : (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 md:px-6 text-sm text-gray-700">No data found</div>
  );
}
