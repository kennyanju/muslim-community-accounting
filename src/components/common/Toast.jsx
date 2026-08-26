'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';

export default function Toast() {
  const { toasts, removeToast } = useApp();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toast-container" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type || 'info'}`}>
          <div className="toast-content">
            <span className="toast-icon" aria-hidden="true">
              {toast.type === 'success' && '✓'}
              {toast.type === 'error' && '✕'}
              {toast.type === 'warning' && '⚠'}
              {(!toast.type || toast.type === 'info') && 'ℹ'}
            </span>
            <span className="toast-message">{toast.message}</span>
          </div>
          <button 
            type="button" 
            className="toast-close" 
            onClick={() => removeToast(toast.id)}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
