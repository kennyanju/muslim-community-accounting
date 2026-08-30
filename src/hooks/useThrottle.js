'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook to throttle a callback function
 * @param {Function} callback - Function to throttle
 * @param {number} limit - Throttle interval in milliseconds (default: 200ms)
 * @returns {Function} Throttled callback
 */
export function useThrottledCallback(callback, limit = 200) {
  const callbackRef = useRef(callback);
  const lastRanRef = useRef(0);
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
    const now = Date.now();
    const remaining = limit - (now - lastRanRef.current);

    if (remaining <= 0) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      lastRanRef.current = now;
      callbackRef.current(...args);
    } else if (!timeoutRef.current) {
      timeoutRef.current = setTimeout(() => {
        lastRanRef.current = Date.now();
        timeoutRef.current = null;
        callbackRef.current(...args);
      }, remaining);
    }
  }, [limit]);
}

/**
 * Custom hook to throttle a state value
 * @param {any} value - Value to throttle
 * @param {number} limit - Throttle interval in milliseconds (default: 200ms)
 * @returns {any} Throttled value
 */
export function useThrottledValue(value, limit = 200) {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastRanRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastRanRef.current;
    const remaining = limit - elapsed;

    if (remaining <= 0 || lastRanRef.current === 0) {
      setThrottledValue(value);
      lastRanRef.current = now;
      return;
    }

    const handler = setTimeout(() => {
      setThrottledValue(value);
      lastRanRef.current = Date.now();
    }, remaining);

    return () => {
      clearTimeout(handler);
    };
  }, [value, limit]);

  return throttledValue;
}

/**
 * Custom hook for throttled window resize events
 * @param {Function} onResize - Resize handler callback
 * @param {number} throttleMs - Throttle duration (default: 150ms)
 */
export function useWindowResize(onResize, throttleMs = 150) {
  const throttledHandler = useThrottledCallback(onResize, throttleMs);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.addEventListener('resize', throttledHandler, { passive: true });
    return () => {
      window.removeEventListener('resize', throttledHandler);
    };
  }, [throttledHandler]);
}

/**
 * Custom hook for throttled window scroll events
 * @param {Function} onScroll - Scroll handler callback
 * @param {number} throttleMs - Throttle duration (default: 100ms)
 */
export function useScrollThrottled(onScroll, throttleMs = 100) {
  const throttledHandler = useThrottledCallback(onScroll, throttleMs);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.addEventListener('scroll', throttledHandler, { passive: true });
    return () => {
      window.removeEventListener('scroll', throttledHandler);
    };
  }, [throttledHandler]);
}

export default useThrottledCallback;
