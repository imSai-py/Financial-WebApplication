import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import LoadingScreen from '../shared/LoadingScreen';

/**
 * Route guard for public-only pages (login, register, forgot-password).
 * Redirects already-authenticated users to /dashboard instead of
 * showing them the login form again.
 *
 * Security rationale:
 *   - Prevents session confusion when a logged-in user navigates to /login
 *   - Avoids the back-button loop (dashboard → login → auto-redirect → dashboard)
 */
export default function PublicOnlyRoute({ children }) {
  const { currentUser, loading } = useAuth();

  // Show branded loading screen while auth state resolves
  if (loading) {
    return <LoadingScreen />;
  }

  // Already authenticated — redirect away from public pages
  if (currentUser) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
