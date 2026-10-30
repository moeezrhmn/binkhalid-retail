"use client";

import "./globals.css";

// Replaces the root layout when it fails, so it brings its own <html> and <body>.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center p-4 font-sans">
        <title>Something went wrong · Bin Khalid POS</title>
        <div className="max-w-md rounded-lg bg-white p-6 text-center shadow-btn">
          <h1 className="text-lg font-semibold text-gray-900">Something went wrong</h1>
          <p className="mt-1 text-sm text-gray-600">
            The app could not load. Check that the server and database are running, then try again.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="mt-4 h-9 rounded-lg bg-brand-700 px-3.5 text-[13px] font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
