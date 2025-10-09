import React, { Fragment, useRef } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { HiX } from "react-icons/hi";

export default function Modal({ isOpen, children, onClose, className = "h-[90vh] !w-[90vw]" }) {
  const cancelButtonRef = useRef();

  if (!isOpen) return <Fragment />;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" initialFocus={cancelButtonRef} open={isOpen} onClose={onClose ? onClose : () => {}}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/70" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel
                className={`w-full z-10 bg-white rounded-xl shadow-searchbar absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 max-h-screen overflow-y-auto ${className}`}
              >
                {onClose && (
                  <div className="absolute cursor-pointer top-5 right-5">
                    <HiX className="text-xl text-gray-500 transition-colors hover:text-red-500" onClick={onClose} />
                  </div>
                )}
                {children}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
