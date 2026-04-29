import { TrendingUp } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';

/**
 * Branded loading screen shown during auth state resolution.
 * Prevents UI flicker between Firebase Auth confirming login
 * and Firestore returning the user's role document.
 */
export default function LoadingScreen() {
  const { settings } = useSettings();
  
  return (
    <div className="loading-screen" role="status" aria-label="Loading">
      {/* Animated background orbs */}
      <div className="loading-screen-orb loading-screen-orb--1" />
      <div className="loading-screen-orb loading-screen-orb--2" />

      {/* Brand mark */}
      <div className="loading-screen-content">
        <div className="loading-screen-logo">
          <TrendingUp size={32} color="white" />
        </div>

        <h1 className="loading-screen-title">{settings?.appName || 'FinanceFlow'}</h1>

        {/* Spinner bar */}
        <div className="loading-screen-bar">
          <div className="loading-screen-bar-fill" />
        </div>

        <p className="loading-screen-text">Loading your workspace…</p>
      </div>
    </div>
  );
}
