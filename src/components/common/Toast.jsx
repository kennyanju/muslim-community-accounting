'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '@/context/AppContext';

function ToastItem({ toast, onRemove }) {
  const [isPaused, setIsPaused] = useState(false);
  const remainingTimeRef = useRef(toast.duration || (toast.type === 'error' ? 6000 : 4500));
  const startTimeRef = useRef(0);
  const timerRef = useRef(null);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      onRemove(toast.id);
    }, remainingTimeRef.current);
  }, [onRemove, toast.id]);

  const pauseTimer = useCallback(() => {
    setIsPaused(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      const elapsed = Date.now() - (startTimeRef.current || Date.now());
      remainingTimeRef.current = Math.max(500, remainingTimeRef.current - elapsed);
    }
  }, []);

  const resumeTimer = useCallback(() => {
    setIsPaused(false);
    startTimer();
  }, [startTimer]);

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [startTimer]);

  return (
    <div 
      className={`toast toast-${toast.type || 'info'} ${isPaused ? 'toast-paused' : ''}`} 
      role="status"
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
    >
      <div className="toast-content">
        <span className="toast-icon" aria-hidden="true">
          {toast.type === 'success' && '✓'}
          {toast.type === 'error' && '✕'}
          {toast.type === 'warning' && '⚠'}
          {(!toast.type || toast.type === 'info') && 'ℹ'}
        </span>
        <span className="toast-message">{toast.message}</span>
        {toast.action && (
          <button 
            type="button" 
            className="toast-action-btn"
            onClick={() => {
              if (typeof toast.action.onClick === 'function') {
                toast.action.onClick();
              }
              onRemove(toast.id);
            }}
          >
            {toast.action.label || 'Retry'}
          </button>
        )}
      </div>
      <button 
        type="button" 
        className="toast-close" 
        onClick={() => onRemove(toast.id)}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

export default function Toast() {
  const { toasts, removeToast } = useApp();

  if (!toasts || toasts.length === 0) return null;

  // Show at most 4 toasts concurrently
  const visibleToasts = toasts.slice(0, 4);

  return (
    <div 
      className="toast-container" 
      role="region" 
      aria-label="Notifications" 
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions text"
    >
      {visibleToasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}
