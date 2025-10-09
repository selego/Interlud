import React from "react"
import { useTranslation } from "react-i18next"
import { IoIosArrowBack, IoIosArrowForward } from "react-icons/io"

export default function Pagination({ total, per_page = 10, currentPage = 1, onNext = () => {}, onPrevious = () => {} }) {
  const { t } = useTranslation("components")

  return total > 0 ? (
    <div className="flex items-center justify-between py-1">
      <div className="flex flex-1 items-center justify-between">
        <div>
          <p className="p-3 text-black-90 text-sm md:text-base">
            {t("showing")}&nbsp;
            <span className="font-medium">{(currentPage - 1) * per_page + 1}</span>&nbsp;
            {t("to")}&nbsp;
            <span className="font-medium">{Math.min(total, currentPage * per_page)}</span>&nbsp;
            {t("of")} <span className="font-medium">{total}</span> {t("result", { count: total })}
          </p>
        </div>
        <div>
          <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm ml-3 bg-white" aria-label={t("pagination")}>
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
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 md:px-6">{t("no_result")}</div>
  )
}
