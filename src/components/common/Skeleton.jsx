'use client';

import React from 'react';

/**
 * Reusable Skeleton Loaders with smooth shimmering animation
 */

export function Skeleton({ className = '', style = {}, width, height, borderRadius }) {
  const inlineStyles = {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(borderRadius ? { borderRadius } : {}),
    ...style
  };

  return <div className={`skeleton-shimmer ${className}`} style={inlineStyles} aria-hidden="true" />;
}

export function CardSkeleton({ count = 1 }) {
  return (
    <div className="skeleton-cards-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass-card skeleton-card">
          <Skeleton height="16px" width="40%" style={{ marginBottom: '12px' }} />
          <Skeleton height="28px" width="70%" style={{ marginBottom: '12px' }} />
          <Skeleton height="14px" width="90%" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 6 }) {
  const headerWidths = ['60%', '85%', '70%', '55%', '75%', '65%', '80%', '50%'];
  const cellWidths = ['50px', '75%', '60%', '80%', '65%', '70%', '55%', '85%'];

  return (
    <div className="skeleton-table-wrapper" aria-hidden="true">
      <div className="skeleton-table-header">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} height="14px" width={headerWidths[i % headerWidths.length]} />
        ))}
      </div>
      <div className="skeleton-table-body">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="skeleton-table-row">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={c}
                height="16px"
                width={c === 0 ? '50px' : cellWidths[(r + c) % cellWidths.length]}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="glass-card skeleton-chart-card" aria-hidden="true" style={{ padding: '24px' }}>
      <Skeleton height="20px" width="45%" style={{ marginBottom: '20px' }} />
      <Skeleton height="180px" width="100%" borderRadius="8px" />
    </div>
  );
}

export default Skeleton;
