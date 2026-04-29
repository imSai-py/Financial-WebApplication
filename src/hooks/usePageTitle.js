import { useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';

/**
 * Sets document.title with a consistent suffix.
 * Restores the previous title on unmount.
 *
 * Usage:
 *   usePageTitle('Admin Dashboard');  // → "Admin Dashboard | FinanceFlow"
 *   usePageTitle(null);               // → "FinanceFlow"
 */
export default function usePageTitle(title) {
  const { settings } = useSettings();
  const appName = settings?.appName || 'FinanceFlow';

  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | ${appName}` : appName;
    return () => { document.title = prev; };
  }, [title, appName]);
}
