import { useRef, useState } from 'react';
import { apiClient } from '../api.js';
import { HeadlineItem } from '../type.js';

function Button({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="min-w-24 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium text-white bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transform hover:scale-[1.02] active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

export function MainPage() {
  const [isLoading, setIsLoading] = useState(false);
  const intervalIdRef = useRef<number | null>(null);
  const [headlines, setHeadlines] = useState<HeadlineItem[] | null>(null);

  const startLoading = () => {
    setIsLoading(true);
  };

  const stopLoading = () => {
    setIsLoading(false);
    if (intervalIdRef.current) {
      window.clearInterval(intervalIdRef.current);
    }
  };

  const handleGetNews = (source: string) => {
    startLoading();
    setHeadlines(null);
    apiClient
      .getNews(source)
      .then((data) => {
        setHeadlines(data ?? []);
      })
      .finally(() => {
        stopLoading();
      });
  };

  return (
    <div className="flex-1 w-full py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-8 p-6 rounded-2xl bg-white shadow-sm border border-gray-100">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gray-100 rounded-xl">
                <span aria-hidden className="text-3xl">
                  📰
                </span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                <span className="bg-gradient-to-r from-gray-800 via-gray-600 to-gray-800 bg-clip-text text-transparent">
                  Get News
                </span>
              </h2>
            </div>
            <p className="text-gray-600 text-lg">
              Tap to pull the latest headlines.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => handleGetNews('npr')} disabled={isLoading}>
              NPR
            </Button>
            <Button
              onClick={() => handleGetNews('groundnews')}
              disabled={isLoading}
            >
              Ground News
            </Button>
            <Button onClick={() => handleGetNews('cnn')} disabled={isLoading}>
              CNN
            </Button>
          </div>
        </div>
        {isLoading && (
          <div className="flex items-center justify-center mt-10">
            <div className="spinner"></div>
          </div>
        )}
        {headlines && (
          <div className="mt-10">
            <ul className="space-y-3 text-left">
              {headlines.map((h, idx) => (
                <li key={`${h.url}-${idx}`} className="group">
                  <a
                    href={h.url}
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
