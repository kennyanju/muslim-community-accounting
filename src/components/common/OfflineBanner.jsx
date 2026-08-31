'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';

export default function OfflineBanner() {
  const { isOnline, checkConnectivity } = useApp();

  if (isOnline) return null;

  return (
    <div className="offline-banner" role="alert" aria-live="assertive">
      <div className="offline-banner-content">
        <span className="offline-icon" aria-hidden="true">⚡</span>
        <div className="offline-text">
          <strong>You are currently offline.</strong>
          <span> Changes will be synchronized when your connection is restored.</span>
        </div>
      </div>
      <button 
        type="button" 
        className="btn btn-sm btn-outline offline-retry-btn"
        onClick={checkConnectivity}
      >
        🔄 Retry Connection
      </button>
    </div>
  );
}
