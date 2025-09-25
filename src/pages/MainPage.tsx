import { useRef, useState } from 'react';
import { apiClient, type HeadlineItem, type HeadlinesResponse } from '../api';

const MESSAGES = [
  'Fetching data…',
  'Parsing data…',
  'Extracting headlines…',
  'Cleaning content…',
  'Analyzing trends…',
  'Finalizing…',
] as const;

export function MainPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [messageIndex, setMessageIndex] = useState<number>(0);
  const intervalIdRef = useRef<number | null>(null);
  const [headlines, setHeadlines] = useState<HeadlineItem[] | null>(null);

  const startLoading = () => {
    setIsLoading(true);
    setMessageIndex(0);
    intervalIdRef.current = window.setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % MESSAGES.length);
    }, 2000);
  };

  const stopLoading = () => {
    setIsLoading(false);
    if (intervalIdRef.current) {
      window.clearInterval(intervalIdRef.current);
    }
  };

  const handleGetNews = () => {
    startLoading();
    setHeadlines(null);
    apiClient
      .getNews()
      .then((res: HeadlinesResponse) => {
        setHeadlines(res.headlines ?? []);
      })
      .finally(() => {
        stopLoading();
      });
  };

  const disabled = isLoading;

  return (
    <div className="flex-1 w-full py-16 px-4 sm:px-6 lg:px-8 ">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3">
            <span aria-hidden className="text-3xl">
              📰
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-gray-900 via-gray-700 to-gray-900 bg-clip-text text-transparent">
                Get News
              </span>
            </h2>
          </div>
          <p className="mt-3 text-gray-600">
            Tap below to pull the latest headlines.
          </p>
        </div>
        <div className="text-center">
          <button
            onClick={handleGetNews}
            disabled={disabled}
            aria-disabled={disabled}
            aria-busy={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-8 py-4 font-semibold text-white bg-neutral-600 hover:bg-neutral-700 transition focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {disabled ? (
              <>
                <svg
                  className="h-5 w-5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
                <span>
                  {isLoading ? `${MESSAGES[messageIndex]}` : 'Working…'}
                </span>
              </>
            ) : (
              <>Get News</>
            )}
          </button>
        </div>
        {headlines && (
          <div className="mt-10">
            <ul className="space-y-3 text-left">
              {headlines.map((h, idx) => (
                <li key={`${h.link}-${idx}`} className="group">
                  <a
                    href={`https://text.npr.org${h.link}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-indigo-700 hover:text-indigo-900 underline decoration-indigo-300 group-hover:decoration-indigo-500"
                  >
                    {h.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
