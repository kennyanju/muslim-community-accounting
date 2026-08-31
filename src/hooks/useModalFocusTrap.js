import { useEffect, useRef } from 'react';

/**
 * Custom hook to trap focus and handle keyboard navigation (Tab, Shift+Tab, Escape)
 * within an active modal dialog. Restores previous focus on unmount.
 */
export function useModalFocusTrap(isOpen, handleClose, modalContainerRef) {
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save currently focused element to restore on close
    if (typeof document !== 'undefined') {
      previousFocusRef.current = document.activeElement;
    }

    const modalEl = modalContainerRef?.current;
    if (!modalEl) return;

    // Focus the first interactive element or input inside the modal
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = Array.from(modalEl.querySelectorAll(focusableSelector));
    
    if (focusableElements.length > 0) {
      // Small timeout to allow DOM transition to settle
      const timeoutId = setTimeout(() => {
        const firstInput = modalEl.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') || focusableElements[0];
        if (firstInput && typeof firstInput.focus === 'function') {
          firstInput.focus();
        }
      }, 50);

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (typeof handleClose === 'function') handleClose();
          return;
        }

        if (e.key === 'Tab') {
          const currentElements = Array.from(modalEl.querySelectorAll(focusableSelector));
          if (currentElements.length === 0) return;

          const firstEl = currentElements[0];
          const lastEl = currentElements[currentElements.length - 1];

          if (e.shiftKey) {
            // Shift + Tab: if on first element, wrap around to last
            if (document.activeElement === firstEl || !modalEl.contains(document.activeElement)) {
              e.preventDefault();
              lastEl.focus();
            }
          } else {
            // Tab: if on last element, wrap around to first
            if (document.activeElement === lastEl || !modalEl.contains(document.activeElement)) {
              e.preventDefault();
              firstEl.focus();
            }
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        clearTimeout(timeoutId);
        window.removeEventListener('keydown', handleKeyDown);
        // Restore focus to previous active element
        if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
          try {
            previousFocusRef.current.focus();
          } catch (err) {}
        }
      };
    }
  }, [isOpen, handleClose, modalContainerRef]);
}
