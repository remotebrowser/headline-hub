import toast from 'react-hot-toast';

const API_BASE_URL = '/api';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type HeadlineItem = {
  title: string;
  link: string;
};

export type HeadlinesResponse = {
  headlines: HeadlineItem[];
};

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    const result: ApiResponse<T> = await response.json();

    if (!response.ok) {
      const errorMessage = `HTTP ${response.status}: ${response.statusText} ${result.error}`;
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }

    if (!result.success) {
      const errorMessage = result.error || 'API request failed';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }

    return result.data as T;
  }

  async getNews(): Promise<HeadlinesResponse> {
    return this.request<HeadlinesResponse>('/news', {
      method: 'GET',
    });
  }
}

export const apiClient = new ApiClient();
