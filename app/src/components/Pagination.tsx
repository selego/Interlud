import React from "react";
import { FaArrowLeft, FaArrowRight } from "react-icons/fa6";

interface PaginationProps {
  total: number;
  per_page?: number;
  currentPage?: number;
  onNext?: () => void;
  onPrevious?: () => void;
  onPageChange?: (page: number) => void;
}

const Pagination = ({ 
  total, 
  per_page = 10, 
  currentPage = 1, 
  onNext = () => {}, 
  onPrevious = () => {}, 
  onPageChange = () => {} 
}: PaginationProps) => {
  const totalPages = Math.ceil(total / per_page);

  if (!total) return null;

  return (
    <div className="flex items-center justify-between mt-6">
      <button
        disabled={currentPage <= 1}
        onClick={onPrevious}
        className="text-sm text-primary hover:text-primary/80 flex items-center disabled:opacity-50 disabled:pointer-events-none"
      >
        <FaArrowLeft className="text-xs mr-1" /> Previous
      </button>
      <div className="flex items-center text-sm text-gray-500">
        <div className="flex space-x-1">
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            let pageNum;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (currentPage <= 3) {
              pageNum = i + 1;
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = currentPage - 2 + i;
            }

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange && onPageChange(pageNum)}
                className={`px-3 py-1 rounded ${pageNum === currentPage ? "text-primary bg-primary/10" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>
      </div>
      <button
        disabled={currentPage >= totalPages}
        onClick={onNext}
        className="text-sm text-primary hover:text-primary/80 flex items-center disabled:opacity-50 disabled:pointer-events-none"
      >
        Next <FaArrowRight className="text-xs ml-2" />
      </button>
    </div>
  );
};

export default Pagination;