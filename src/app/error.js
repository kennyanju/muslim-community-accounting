'use client';

import React, { useEffect } from 'react';
import { reportClientError } from '@/lib/errorReporting';

export default function Error({ error, reset }) {
  useEffect(() => {
    reportClientError(error, { source: 'app/error.js root boundary' });
  }, [error]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg-primary, #0f172a)',
      padding: '24px',
      color: 'var(--text-primary, #f8fafc)',
      fontFamily: 'var(--font-body, system-ui, sans-serif)'
    }}>
      <div className="glass-card" style={{
        maxWidth: '520px',
        width: '100%',
        padding: '48px 32px',
        textAlign: 'center',
        background: 'var(--bg-secondary, #1e293b)',
        borderRadius: '20px',
        border: '1px solid var(--border-color, #334155)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          background: 'rgba(239, 68, 68, 0.15)',
          color: '#ef4444',
          fontSize: '32px',
          marginBottom: '20px'
        }}>
          ⚠️
        </div>

        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 800,
          margin: '0 0 10px 0',
          color: 'var(--text-primary, #f8fafc)'
        }}>
          Application Exception Occurred
        </h1>

        <p style={{
          fontSize: '0.9rem',
          color: 'var(--text-secondary, #94a3b8)',
          lineHeight: 1.6,
          margin: '0 0 24px 0'
        }}>
          An unexpected error occurred while processing this financial ledger view. The error has been logged for system auditing.
        </p>

        {error?.message && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(0,0,0,0.25)',
            borderRadius: '8px',
            marginBottom: '24px',
            textAlign: 'left',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            color: '#f87171',
            overflowX: 'auto'
          }}>
            {error.message}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              backgroundColor: '#10b981',
              color: '#ffffff',
              padding: '12px 24px',
              borderRadius: '10px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.95rem'
            }}
          >
            🔄 Try Again
          </button>

          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.href = '/';
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              backgroundColor: 'transparent',
              color: 'var(--text-primary, #f8fafc)',
              padding: '12px 24px',
              borderRadius: '10px',
              fontWeight: 600,
              border: '1px solid var(--border-color, #334155)',
              cursor: 'pointer',
              fontSize: '0.95rem'
            }}
          >
            Go to Home
          </button>
        </div>
      </div>
    </div>
  );
}
