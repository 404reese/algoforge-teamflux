import Link from "next/link";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full bg-transparent mt-auto">
      <div className="max-w-4xl mx-auto px-6 sm:px-8 md:px-12 lg:px-0 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
          <div className="text-gray-500 dark:text-gray-500 text-sm font-medium leading-5 font-sans">
           &copy; {currentYear} Axiom Station. All rights reserved.
          </div>

          <div className="flex items-center space-x-6">
            <Link
              href="/"
              className="text-gray-600 dark:text-gray-400 text-sm font-medium leading-5 font-sans hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Home
            </Link>
            <Link
              href="/privacy"
              className="text-gray-600 dark:text-gray-400 text-sm font-medium leading-5 font-sans hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-gray-600 dark:text-gray-400 text-sm font-medium leading-5 font-sans hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
