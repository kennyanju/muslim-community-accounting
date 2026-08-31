/**
 * Custom Network Error for offline / connection drops
 */
export class NetworkError extends Error {
  constructor(message = 'Network connection failed. You may be offline.') {
    super(message);
    this.name = 'NetworkError';
    this.isNetworkError = true;
  }
}

/**
 * Standard Fetch Wrapper with automatic session cookie forwarding,
 * abort controller support, and resilient offline/network error detection.
 */
export async function fetchAPI(endpoint, options = {}) {
  // 1. Check if client is explicitly offline before issuing request
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' && !navigator.onLine) {
    throw new NetworkError('Unable to connect to server. Please check your internet connection.');
  }

  try {
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: options.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || `Request failed with status ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  } catch (err) {
    // If request was aborted by AbortController, rethrow with name for caller detection
    if (err.name === 'AbortError') {
      throw err;
    }

    // Classify generic fetch failure as NetworkError
    if (err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed to fetch') || err.message.includes('Load failed'))) {
      throw new NetworkError('Network request failed. Please check your internet connection.');
    }

    throw err;
  }
}
