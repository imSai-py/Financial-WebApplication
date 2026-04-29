import { useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import AdminDashboard from './AdminDashboard';
import StaffDashboard from './StaffDashboard';
import CustomerDashboard from './CustomerDashboard';
import AgentDashboard from './AgentDashboard';
import RoleErrorScreen from '../shared/RoleErrorScreen';

/**
 * Role-based dashboard switcher.
 *
 * ROUTING PATTERN: Single-URL (/dashboard) with component switching.
 * All roles share the same URL — the rendered component depends on
 * the user's role from AuthContext. This prevents URL-sniffing attacks
 * (no /admin-dashboard to guess).
 *
 * DEEP LINKING: The current architecture supports future deep linking
 * via nested routes (e.g., /dashboard/users/123) or query parameters
 * (e.g., /dashboard?view=user&id=123). The DashboardRouter validates
 * the role BEFORE any nested content renders, so deep links are safe.
 * This is a Phase 6+ enhancement.
 *
 * DEFENSE LAYERS at this component:
 *   1. Suspended status check (Edge Case C — belt-and-suspenders)
 *   2. Role → Component switch
 *   3. Unknown role → RoleErrorScreen with auto-logout
 */

const PAGE_TITLES = {
  admin:    'Admin Dashboard',
  staff:    'Staff Dashboard',
  customer: 'My Dashboard',
  agent:    'Agent Dashboard',
};

export default function DashboardRouter() {
  const { userProfile, logout } = useAuth();
  const logoutTriggered = useRef(false);

  // Per-role page title (Improvement 2)
  usePageTitle(PAGE_TITLES[userProfile?.role] || 'Dashboard');

  // ── Edge Case C: Suspended status defense-in-depth ──
  // Moved to useEffect to avoid calling logout() during render
  // (which would cause "Maximum update depth exceeded" errors).
  const isSuspended = userProfile?.status === 'suspended' || userProfile?.status === 'deactivated';

  useEffect(() => {
    if (isSuspended && !logoutTriggered.current) {
      logoutTriggered.current = true;
      logout();
    }
  }, [isSuspended, logout]);

  // Show nothing while signOut() is processing
  if (isSuspended) {
    return null;
  }

  switch (userProfile?.role) {
    case 'admin':    return <AdminDashboard />;
    case 'staff':    return <StaffDashboard />;
    case 'customer': return <CustomerDashboard />;
    case 'agent':    return <AgentDashboard />;
    default:         return <RoleErrorScreen />;
  }
}
