'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDebounce } from '@/hooks/usePerformanceHooks';

export default function DonorTypeahead({
  selectedDonorId = 'anonymous',
  onSelectDonor,
  disabled = false,
  donors = []
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [fetchedDonor, setFetchedDonor] = useState(null);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const debouncedQuery = useDebounce(searchQuery, 250);

  // Derive selected donor without redundant state syncing
  const selectedDonor = useMemo(() => {
    if (selectedDonorId === 'anonymous' || !selectedDonorId) {
      return {
        id: 'anonymous',
        name: 'Anonymous Cash Donor',
        is_anonymous: true,
        gift_aid_eligible: false
      };
    }
    const match = donors.find(d => d.id === selectedDonorId);
    if (match) return match;
    if (fetchedDonor && fetchedDonor.id === selectedDonorId) return fetchedDonor;
    return {
      id: selectedDonorId,
      name: 'Donor Profile',
      is_anonymous: false,
      gift_aid_eligible: false
    };
  }, [selectedDonorId, donors, fetchedDonor]);

  // Fetch individual donor asynchronously only if not in local cache
  useEffect(() => {
    if (selectedDonorId && selectedDonorId !== 'anonymous') {
      const match = donors.find(d => d.id === selectedDonorId);
      if (!match && (!fetchedDonor || fetchedDonor.id !== selectedDonorId)) {
        let active = true;
        fetch(`/api/donors/${selectedDonorId}`)
          .then(res => res.json())
          .then(data => {
            if (active && data.success && data.data) {
              setFetchedDonor(data.data);
            }
          })
          .catch(() => {});
        return () => {
          active = false;
        };
      }
    }
  }, [selectedDonorId, donors, fetchedDonor]);

  // Handle outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Default initial donors
  const defaultResults = useMemo(() => [
    { id: 'anonymous', name: 'Anonymous Cash Donor', is_anonymous: true, gift_aid_eligible: false },
    ...donors.filter(d => !d.is_anonymous).slice(0, 8)
  ], [donors]);

  const results = debouncedQuery.trim() ? searchResults : defaultResults;

  // Async search
  useEffect(() => {
    if (!isOpen || !debouncedQuery.trim()) {
      return;
    }

    let active = true;
    fetch(`/api/donors?search=${encodeURIComponent(debouncedQuery.trim())}`)
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        if (data.success && Array.isArray(data.data)) {
          const list = data.data.filter(d => !d.is_anonymous);
          setSearchResults([
            { id: 'anonymous', name: 'Anonymous Cash Donor', is_anonymous: true, gift_aid_eligible: false },
            ...list
          ]);
        }
      })
      .catch(() => {
        if (!active) return;
        const q = debouncedQuery.toLowerCase();
        const filtered = donors.filter(d =>
          !d.is_anonymous &&
          (d.name?.toLowerCase().includes(q) ||
           d.postcode?.toLowerCase().includes(q) ||
           d.email?.toLowerCase().includes(q))
        );
        setSearchResults([
          { id: 'anonymous', name: 'Anonymous Cash Donor', is_anonymous: true, gift_aid_eligible: false },
          ...filtered
        ]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedQuery, isOpen, donors]);

  const handleSelect = (donor) => {
    setIsOpen(false);
    setSearchQuery('');
    setHighlightedIndex(-1);
    if (onSelectDonor) {
      onSelectDonor(donor);
    }
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && results[highlightedIndex]) {
        handleSelect(results[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="donor-typeahead-container" ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {!isOpen && selectedDonor ? (
        <div 
          className="selected-donor-display"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: 'var(--input-bg, #1a202c)',
            border: '1px solid var(--border-color, #2d3748)',
            borderRadius: '6px',
            minHeight: '42px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <span style={{ fontSize: '1.1rem' }}>{selectedDonor.is_anonymous ? '👤' : '🤲'}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                {selectedDonor.name}
              </div>
              {!selectedDonor.is_anonymous && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {selectedDonor.postcode ? `${selectedDonor.address_line_1 || ''}, ${selectedDonor.postcode}` : 'No address on file'}
                  {selectedDonor.gift_aid_eligible ? (
                    <span style={{ marginLeft: '6px', color: '#38a169', fontWeight: 600 }}>✓ Gift Aid</span>
                  ) : (
                    <span style={{ marginLeft: '6px', color: 'var(--text-muted, #718096)' }}>No Gift Aid</span>
                  )}
                </div>
              )}
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setIsOpen(true);
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              style={{ padding: '4px 8px', fontSize: '0.75rem', height: '28px' }}
              title="Search or change donor"
            >
              Change
            </button>
          )}
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            type="text"
            id="tx-donor-search"
            className="input-field"
            placeholder="Type name, address, or postcode..."
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              if (e.target.value.trim()) setLoading(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            autoComplete="off"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls="donor-results-list"
            style={{ width: '100%', paddingRight: '30px' }}
          />
          {loading && (
            <span style={{ position: 'absolute', right: '10px', top: '10px', fontSize: '0.8rem' }}>⏳</span>
          )}
        </div>
      )}

      {isOpen && (
        <ul
          id="donor-results-list"
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            margin: '4px 0 0 0',
            padding: 0,
            listStyle: 'none',
            maxHeight: '260px',
            overflowY: 'auto',
            background: 'var(--modal-bg, #1a202c)',
            border: '1px solid var(--border-color, #4a5568)',
            borderRadius: '6px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
          }}
        >
          {results.length === 0 && !loading && (
            <li style={{ padding: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
              No matching donors found.
            </li>
          )}
          {results.map((donor, idx) => {
            const isHighlighted = idx === highlightedIndex;
            const isSelected = donor.id === selectedDonor?.id;
            return (
              <li
                key={donor.id}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(donor)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-color, #2d3748)',
                  background: isHighlighted ? 'var(--highlight-bg, rgba(66, 153, 225, 0.15))' : isSelected ? 'rgba(72, 187, 120, 0.1)' : 'transparent',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: isSelected ? 700 : 500, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    {donor.is_anonymous ? '👤 Anonymous Cash Donor' : donor.name}
                  </div>
                  {!donor.is_anonymous && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {donor.address_line_1 ? `${donor.address_line_1}, ` : ''}{donor.postcode || 'No postcode'}
                    </div>
                  )}
                </div>
                {!donor.is_anonymous && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: 600,
                      background: donor.gift_aid_eligible ? 'rgba(72, 187, 120, 0.2)' : 'rgba(160, 174, 192, 0.15)',
                      color: donor.gift_aid_eligible ? '#48bb78' : '#a0aec0'
                    }}
                  >
                    {donor.gift_aid_eligible ? 'Gift Aid Eligible' : 'No Gift Aid'}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
