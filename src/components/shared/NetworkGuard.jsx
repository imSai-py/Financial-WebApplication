import { WifiOff, RefreshCw } from 'lucide-react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

/**
 * YONO SBI-style offline guard.
 * Wraps post-login content. When offline, shows a full-screen overlay
 * with a "No Internet" message instead of the protected content.
 * The login page itself remains accessible offline (handled in App.jsx routing).
 */
export default function NetworkGuard({ children }) {
  const { isOnline } = useNetworkStatus();

  if (!isOnline) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'var(--color-bg-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem',
      }}>
        <div style={{
          textAlign: 'center', maxWidth: 400,
          animation: 'fadeIn 0.4s ease-out both',
        }}>
          {/* Offline icon */}
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '2px solid rgba(239, 68, 68, 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem',
          }}>
            <WifiOff size={36} color="var(--color-danger)" />
          </div>

          <h2 style={{
            fontSize: '1.375rem', fontWeight: 700,
            color: 'var(--color-text-primary)',
            marginBottom: '0.75rem',
          }}>
            No Internet Connection
          </h2>

          <p style={{
            fontSize: '0.9375rem', lineHeight: 1.6,
            color: 'var(--color-text-secondary)',
            marginBottom: '2rem',
          }}>
            Please check your internet connection and try again. 
            A stable connection is required to access your account.
          </p>

          <button
            onClick={() => window.location.reload()}
            className="btn btn-primary btn-lg"
            style={{
              gap: '0.5rem', minWidth: 180,
              padding: '0.875rem 2rem',
            }}
          >
            <RefreshCw size={18} />
            Try Again
          </button>

          <p style={{
            marginTop: '1.5rem',
            fontSize: '0.75rem',
            color: 'var(--color-text-muted)',
          }}>
            If the problem persists, contact support.
          </p>
        </div>
      </div>
    );
  }

  return children;
}
