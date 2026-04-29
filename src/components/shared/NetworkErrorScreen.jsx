import { WifiOff, RefreshCw } from 'lucide-react';

/**
 * Full-screen error shown when role resolution fails due to network issues.
 *
 * Scenarios that land here:
 *   - Firestore is unreachable (no internet)
 *   - Role fetch times out (> 10 seconds)
 *   - onSnapshot listener error
 *
 * The Retry button refreshes the page, which re-triggers
 * Firebase Auth resolution and a fresh Firestore connection.
 */
export default function NetworkErrorScreen() {
  return (
    <div className="error-screen" role="alert">
      {/* Ambient backdrop */}
      <div className="error-screen-orb error-screen-orb--1" />
      <div className="error-screen-orb error-screen-orb--2" />

      <div className="error-screen-content">
        <div className="error-screen-icon error-screen-icon--warning">
          <WifiOff size={32} color="white" />
        </div>

        <h1 className="error-screen-title">Connection Issue</h1>

        <p className="error-screen-description">
          We're having trouble connecting to the server.
          <br />
          Check your internet connection and try again.
        </p>

        <button
          onClick={() => window.location.reload()}
          className="btn btn-primary"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.75rem 1.5rem', fontSize: '0.875rem',
          }}
        >
          <RefreshCw size={16} /> Retry Connection
        </button>

        <p className="error-screen-subtext">
          If the problem persists, contact your system administrator.
        </p>
      </div>
    </div>
  );
}
