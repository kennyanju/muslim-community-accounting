'use client';

import React, { useEffect } from 'react';
import { reportClientError } from '@/lib/errorReporting';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    reportClientError(error, { source: 'app/global-error.js root layout boundary' });
  }, [error]);

  return (
    <html lang="en">
      <head>
        <title>System Error — Masjid Accounting</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #0f172a;
            color: #f8fafc;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
          }
          .card {
            max-width: 500px;
            width: 100%;
            padding: 40px 32px;
            background: #1e293b;
            border-radius: 16px;
            border: 1px solid #334155;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.4);
          }
          .icon {
            font-size: 36px;
            margin-bottom: 16px;
          }
          h1 {
            font-size: 1.6rem;
            font-weight: 700;
            margin-bottom: 12px;
            color: #f8fafc;
          }
          p {
            font-size: 0.92rem;
            color: #94a3b8;
            line-height: 1.6;
            margin-bottom: 24px;
          }
          .btn-group {
            display: flex;
            gap: 12px;
            justify-content: center;
          }
          button {
            padding: 12px 22px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.95rem;
            cursor: pointer;
            border: none;
          }
          .btn-primary {
            background: #10b981;
            color: #ffffff;
          }
          .btn-secondary {
            background: transparent;
            color: #f8fafc;
            border: 1px solid #475569;
          }
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="icon">🕌</div>
          <h1>Critical System Error</h1>
          <p>
            The accounting system encountered an unrecoverable root layout error. Your financial data remains securely stored.
          </p>
          <div className="btn-group">
            <button type="button" className="btn-primary" onClick={() => reset()}>
              🔄 Restart Application
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.href = '/';
              }}
            >
              Go to Home
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
