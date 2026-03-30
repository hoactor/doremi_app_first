const OPENAI_STORAGE_KEY = 'openai_api_key_v2';

// --- OpenAI API Key ---
export const saveOpenAiApiKey = (apiKey: string) => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(OPENAI_STORAGE_KEY, apiKey); // No encoding needed
  }
};

export const loadOpenAiApiKey = (): string | null => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(OPENAI_STORAGE_KEY);
  }
  return null;
};

export const removeOpenAiApiKey = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(OPENAI_STORAGE_KEY);
  }
};
