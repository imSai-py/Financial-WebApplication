import { useState, useEffect } from 'react';

/**
 * Custom hook for responsive breakpoint detection.
 * @param {number} breakpoint - Max width in pixels (e.g., 768)
 * @returns {boolean} - True if viewport is at or below the breakpoint
 */
export function useMediaQuery(breakpoint) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= breakpoint;
  });

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e) => setMatches(e.matches);

    // Set initial value
    setMatches(mql.matches);

    // Modern browsers
    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    // Fallback for older browsers
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, [breakpoint]);

  return matches;
}

/**
 * Predefined breakpoint hooks
 */
export function useIsMobile() { return useMediaQuery(768); }
export function useIsTablet() { return useMediaQuery(1024); }
export function useIsSmallMobile() { return useMediaQuery(480); }
