import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldAlert, LogOut } from 'lucide-react';

const AUTO_LOGOUT_SECONDS = 30;

/**
 * Full-screen error for users with unknown/missing role.
 *
 * Scenarios that land here:
 *   - Firestore doc has a corrupted or unrecognized role value
 *   - Incomplete signup (doc written without role field)
 *   - Manual Firestore edit with a typo
 *
 * Auto-signs out after 30 seconds to prevent "zombie sessions"
 * where a user is authenticated but can't access anything.
 */
export default function RoleErrorScreen() {
  const { logout, userProfile } = useAuth();
  const [countdown, setCountdown] = useState(AUTO_LOGOUT_SECONDS);

  // Auto-logout countdown
  useEffect(() => {
    if (countdown <= 0) {
      logout();
      return;
    }
    const timer = setInterval(() => {
      setCountdown(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown, logout]);

  return (
    <div className="error-screen" role="alert">
      {/* Ambient backdrop */}
      <div className="error-screen-orb error-screen-orb--1" />
      <div className="error-screen-orb error-screen-orb--2" />

      <div className="error-screen-content">
        <div className="error-screen-icon error-screen-icon--danger">
          <ShieldAlert size={32} color="white" />
        </div>

        <h1 className="error-screen-title">Account Configuration Error</h1>

        <p className="error-screen-description">
          Your account doesn't have a valid role assigned
          {userProfile?.role ? ` (received: "${userProfile.role}")` : ''}.
          <br />
          Please contact your system administrator to resolve this.
        </p>

        <button
          onClick={() => logout()}
          className="btn btn-primary"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.75rem 1.5rem', fontSize: '0.875rem',
          }}
        >
          <LogOut size={16} /> Sign Out Now
        </button>

        <p className="error-screen-countdown">
          Auto-signing out in {countdown} second{countdown !== 1 ? 's' : ''}…
        </p>
      </div>
    </div>
  );
}
