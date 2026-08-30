'use client';

import React from 'react';

/**
 * Reusable Rich Empty State Component
 * @param {string} icon - Emoji or icon string
 * @param {string} title - Heading
 * @param {string} description - Descriptive text
 * @param {string} actionLabel - Button label
 * @param {Function} onAction - Action click handler
 * @param {string} secondaryActionLabel - Optional secondary button label
 * @param {Function} onSecondaryAction - Optional secondary action click handler
 */
export default function EmptyState({
  icon = '📭',
  title = 'No records found',
  description = 'There is currently no data to display in this view.',
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className = ''
}) {
  return (
    <div className={`empty-state-card ${className}`} role="status">
      <div className="empty-state-icon" aria-hidden="true">
        {icon}
      </div>
      <h4 className="empty-state-title">{title}</h4>
      <p className="empty-state-description">{description}</p>
      
      {(actionLabel || secondaryActionLabel) && (
        <div className="empty-state-actions">
          {actionLabel && onAction && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onAction}
            >
              {actionLabel}
            </button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onSecondaryAction}
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
