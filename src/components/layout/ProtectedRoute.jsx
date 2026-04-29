import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useSettings } from '../../contexts/SettingsContext';
import { AlertOctagon } from 'lucide-react';
import LoadingScreen from '../shared/LoadingScreen';
import NetworkErrorScreen from '../shared/NetworkErrorScreen';

/**
 * Protected route wrapper — 5-gate auth guard.
 *
 * Gate 1:   loading       → Show branded LoadingScreen (prevents flicker)
 * Gate 1.5: authError     → Show NetworkErrorScreen (timeout / no internet)
 * Gate 2:   !user         → Redirect to /login
 * Gate 3:   !profile      → Redirect to /login (profile fetch failed)
 * Gate 4:   role check    → Toast + redirect to /dashboard (not /login)
 *
 * The Gate 4 behavior (redirect to /dashboard, not /login) is intentional:
 * the user IS authenticated, just not authorized for THIS route.
 *
 * Gate 1.5 (Edge Case B — Network Drop):
 * If the auth/role resolution takes longer than 10 seconds (timeout set
 * in AuthContext), authError is set. This shows a "Connection Issue" UI
 * with a retry button instead of an infinite spinner.
 *
 * @param {ReactNode} children - The protected content
 * @param {string[]} [allowedRoles] - Roles permitted to view this route.
 *   If omitted, any authenticated user can access.
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { currentUser, userProfile, loading, authError } = useAuth();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const hasNotified = useRef(false);

  // Determine if access is unauthorized BEFORE rendering
  const isUnauthorized = !loading
    && currentUser
    && userProfile
    && allowedRoles
    && !allowedRoles.includes(userProfile.role);

  // Fire toast notification when user is redirected due to insufficient role
  useEffect(() => {
    if (isUnauthorized && !hasNotified.current) {
      showToast(
        "You don't have permission to access that page.",
        'warning'
      );
      hasNotified.current = true;
    }
  }, [isUnauthorized, showToast]);

  // Reset notification flag when route changes (allowedRoles prop changes)
  useEffect(() => {
    hasNotified.current = false;
  }, [allowedRoles]);

  // Gate 1: Auth state still resolving — show branded loading screen
  if (loading) {
    return <LoadingScreen />;
  }

  // Gate 1.5: Auth resolved but encountered a network/timeout error
  // (Edge Case B — prevents infinite spinner when Firestore is unreachable)
  if (authError) {
    return <NetworkErrorScreen />;
  }

  // Gate 2: Not authenticated
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Gate 3: Authenticated but profile fetch failed
  if (!userProfile) {
    return <Navigate to="/login" replace />;
  }

  // Gate 4: Authenticated but role not authorized for this route
  if (isUnauthorized) {
    return <Navigate to="/dashboard" replace />;
  }

  // Gate 5: Maintenance Mode Blocker (Admins bypass this)
  if (settings?.maintenanceMode && userProfile?.role !== 'admin') {
    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        padding: '2rem', background: 'var(--color-bg-primary)',
      }}>
        <AlertOctagon size={64} color="var(--color-danger)" style={{ marginBottom: '1.5rem' }} />
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '1rem' }}>
          System Under Maintenance
        </h1>
        <p style={{ fontSize: '1.125rem', color: 'var(--color-text-secondary)', maxWidth: 500, lineHeight: 1.6 }}>
          We are currently performing scheduled maintenance to improve our services.
          Please check back shortly.
        </p>
      </div>
    );
  }

  return children;
}
