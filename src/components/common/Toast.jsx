'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';

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
        <div key={toast.id} className={`toast toast-${toast.type || 'info'}`} role="status">
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
                  removeToast(toast.id);
                }}
              >
                {toast.action.label || 'Retry'}
              </button>
            )}
          </div>
          <button 
            type="button" 
            className="toast-close" 
            onClick={() => removeToast(toast.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
