'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook to debounce value changes
 * @param {any} value - The input value to debounce
 * @param {number} delay - Delay in milliseconds (default: 300ms)
 * @returns {any} The debounced value
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Custom hook to debounce a callback function
 * @param {Function} callback - Function to debounce
 * @param {number} delay - Delay in milliseconds (default: 300ms)
 * @returns {Function} Debounced callback
 */
export function useDebouncedCallback(callback, delay = 300) {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay]);
}

export default useDebounce;
