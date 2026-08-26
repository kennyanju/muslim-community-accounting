'use client';

import React from 'react';

export default function Pagination({
  currentPage = 1,
  totalItems = 0,
  itemsPerPage = 15,
  onPageChange
}) {
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <nav className="pagination-bar" aria-label="Pagination Navigation">
      <div className="pagination-info">
        Showing <strong>{startItem}</strong> – <strong>{endItem}</strong> of <strong>{totalItems}</strong> records
      </div>

      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-btn"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Previous Page"
        >
          &larr; Prev
        </button>

        <span className="pagination-current">
          Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
        </span>

        <button
          type="button"
          className="pagination-btn"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Next Page"
        >
          Next &rarr;
        </button>
      </div>
    </nav>
  );
}
