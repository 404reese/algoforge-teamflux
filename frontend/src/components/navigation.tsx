"use client";

import Link from "next/link";
import { useAuth } from "../contexts/AuthContext";
import { ThemeToggle } from "./theme-toggle";

export function Navigation() {
  const { user } = useAuth();
  return (
    <div className="w-full h-12 sm:h-14 md:h-16 lg:h-[84px] absolute left-0 top-0 flex justify-center items-center z-20 px-6 sm:px-8 md:px-12 lg:px-0">
      <div className="w-full h-0 absolute left-0 top-6 sm:top-7 md:top-8 lg:top-[42px] border-t border-gray-300 dark:border-gray-800/30" />

      <div className="w-full max-w-[calc(100%-32px)] sm:max-w-[calc(100%-48px)] md:max-w-[calc(100%-64px)] lg:max-w-[700px] lg:w-[700px] h-10 sm:h-11 md:h-12 py-1.5 sm:py-2 px-3 sm:px-4 md:px-4 pr-2 sm:pr-3 bg-white/80 dark:bg-[#0f1420]/80 backdrop-blur-md border border-gray-300 dark:border-gray-800/40 overflow-hidden rounded-[50px] flex justify-between items-center relative z-30">
        <div className="flex justify-center items-center">
          <Link
            href="/"
            className="flex justify-start items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img
              src="/logo3-black.png"
              alt="axiom station"
              className="w-5 h-5 sm:w-6 sm:h-6 block dark:hidden"
            />

            <img
              src="/logo3-white.png"
              alt="axiom station"
              className="w-5 h-5 sm:w-6 sm:h-6 hidden dark:block"
            />
            <div className="font-title flex flex-col justify-center text-gray-900 dark:text-white text-sm sm:text-base md:text-lg lg:text-xl font-medium leading-5 font-sans">
              axiomstation_
            </div>
          </Link>
        </div>
        <div className="h-6 sm:h-7 md:h-8 flex justify-start items-center gap-2 sm:gap-3">
          <ThemeToggle />
          {user ? (
            <>
              <div className="px-2 sm:px-3 md:px-[14px] py-1 sm:py-[6px] bg-gray-200 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 overflow-hidden rounded-full flex justify-center items-center">
                <Link href="/projects">
                  <div className="flex flex-col justify-center text-gray-900 dark:text-white text-xs md:text-[13px] font-medium leading-5 font-sans">
                    Projects
                  </div>
                </Link>
              </div>
              <div className="px-2 sm:px-3 md:px-[14px] py-1 sm:py-[6px] bg-gray-200 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 overflow-hidden rounded-full flex justify-center items-center">
                <Link href="/settings">
                  <div className="flex flex-col justify-center text-gray-900 dark:text-white text-xs md:text-[13px] font-medium leading-5 font-sans">
                    Settings
                  </div>
                </Link>
              </div>
            </>
          ) : (
            <Link href="/auth">
              <div className="px-3 sm:px-4 md:px-5 py-1 sm:py-[6px] relative bg-gray-800 dark:bg-gray-800 border border-gray-700 dark:border-gray-700 overflow-hidden rounded-full flex justify-center items-center cursor-pointer hover:bg-gray-700 dark:hover:bg-gray-700 transition-colors">
                <div className="flex flex-col justify-center text-white dark:text-white text-xs md:text-[13px] font-medium leading-5 font-sans relative z-10">
                  Log in
                </div>
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
