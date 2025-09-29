import { useEffect, useRef, useState } from 'react';
import { apiClient, type NewsSourceItem, type HeadlineItem } from '../api';

const MESSAGES = [
  'Fetching data…',
  'Parsing data…',
  'Extracting headlines…',
  'Cleaning content…',
  'Analyzing trends…',
  'Finalizing…',
] as const;

export function MainPage() {
  const [newsSources, setNewsSources] = useState<NewsSourceItem[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | undefined>();

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
    if (!selectedSource) {
      return;
    }
    startLoading();
    setHeadlines(null);
    apiClient
      .getNews(selectedSource)
      .then((res) => {
        setHeadlines(res ?? []);
      })
      .finally(() => {
        stopLoading();
      });
  };

  useEffect(() => {
    apiClient.getNewsSources().then((res) => {
      setNewsSources(res ?? []);
      setSelectedSource(res?.[0]?.id);
    });
  }, []);

  const disabled = isLoading;

  return (
    <div className="flex-1 w-full py-16 px-4 sm:px-6 lg:px-8">
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
            Select a source and tap below to pull the latest headlines.
          </p>
        </div>
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-48">
            <select
              value={selectedSource}
              onChange={(e) =>
                setSelectedSource(e.target.value as typeof selectedSource)
              }
              disabled={isLoading}
              className="block w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-60 disabled:cursor-not-allowed appearance-none cursor-pointer"
            >
              {newsSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
              <svg
                className="h-4 w-4 fill-current"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
              >
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
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
        </div>
        {headlines && (
          <div className="mt-10">
            <ul className="space-y-3 text-left">
              {headlines.map((h, idx) => (
                <li key={`${h.link}-${idx}`} className="group">
                  <a
                    href={h.link}
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
