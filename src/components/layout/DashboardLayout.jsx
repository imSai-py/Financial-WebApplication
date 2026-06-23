import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import NetworkGuard from '../shared/NetworkGuard';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useAuth } from '../../contexts/AuthContext';
import SignOutConfirmDialog from './SignOutConfirmDialog';
import FirstLoginPasswordModal from '../auth/FirstLoginPasswordModal';

const COLLAPSE_KEY = 'ff_sidebar_collapsed';

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, userProfile, currentUser } = useAuth();

  // Persist collapsed state in localStorage
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  function toggleCollapse() {
    setCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, String(next));
      } catch {
        // Local storage can be blocked in private browsing or hardened browsers.
      }
      return next;
    });
  }

  // Reset collapsed on mobile (sidebar is always full-width off-canvas on mobile)
  useEffect(() => {
    if (isMobile && collapsed) {
      // Don't force un-collapse — just don't use collapsed mode on mobile
    }
  }, [isMobile, collapsed]);

  const sidebarMargin = isMobile
    ? 0
    : collapsed
      ? 'var(--sidebar-collapsed-width)'
      : 'var(--sidebar-width)';

  const showBackButton = location.pathname !== '/dashboard';

  function handleBack() {
    const historyIndex = typeof window !== 'undefined' ? window.history.state?.idx ?? 0 : 0;
    if (historyIndex > 0) {
      navigate(-1);
      return;
    }

    navigate('/dashboard', { replace: true });
  }

  async function handleConfirmSignOut() {
    if (signingOut) return;

    setSigningOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
      setShowSignOutConfirm(false);
      setSidebarOpen(false);
    }
  }

  return (
    <NetworkGuard>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={collapsed}
          onCollapse={toggleCollapse}
          onSignOut={() => setShowSignOutConfirm(true)}
        />

        <div style={{
          flex: 1,
          marginLeft: sidebarMargin,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          width: isMobile ? '100%' : undefined,
        }}>
          <Header
            onMenuToggle={() => setSidebarOpen(prev => !prev)}
            showBackButton={showBackButton}
            onBack={handleBack}
          />

          <main style={{
            flex: 1,
            padding: isMobile ? '1rem' : '1.5rem',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}>
            <Outlet />
          </main>
        </div>
      </div>
      <SignOutConfirmDialog
        isOpen={showSignOutConfirm}
        onClose={() => {
          if (!signingOut) {
            setShowSignOutConfirm(false);
          }
        }}
        onConfirm={handleConfirmSignOut}
        loading={signingOut}
      />
      <FirstLoginPasswordModal
        isOpen={userProfile?.mustChangePassword === true}
        currentUser={currentUser}
      />
    </NetworkGuard>
  );
}
