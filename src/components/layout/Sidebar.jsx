import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { getNavItems } from '../../utils/rolePermissions';
import { useIsMobile } from '../../hooks/useMediaQuery';
import {
  LayoutDashboard, Users, ArrowLeftRight, CheckSquare,
  IndianRupee, ScrollText, Settings, LogOut, X, TrendingUp,
  UserCog, BarChart3, Landmark, Briefcase, ChevronsLeft, ChevronsRight,
} from 'lucide-react';

const iconMap = {
  LayoutDashboard, Users, ArrowLeftRight, CheckSquare,
  IndianRupee, ScrollText, Settings, UserCog, BarChart3, Landmark, Briefcase,
};

export default function Sidebar({ isOpen, onClose, collapsed, onCollapse }) {
  const { userProfile, logout } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const navItems = getNavItems(userProfile?.role);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  // On mobile, sidebar is never "collapsed" — it's the full off-canvas drawer
  const isCollapsed = !isMobile && collapsed;
  const sidebarWidth = isMobile
    ? '85vw'
    : (isCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)');
  const maxW = isMobile
    ? 320
    : (isCollapsed ? 68 : 260);

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && isMobile && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 40,
            animation: 'fadeIn 0.2s ease-out',
          }}
        />
      )}

      <aside
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0,
          width: sidebarWidth,
          maxWidth: maxW,
          background: 'var(--color-bg-secondary)',
          borderRight: '1px solid var(--color-border)',
          display: 'flex', flexDirection: 'column',
          zIndex: 50,
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isMobile && !isOpen ? 'translateX(-100%)' : 'translateX(0)',
          boxShadow: isMobile && isOpen ? '4px 0 24px rgba(0,0,0,0.3)' : 'none',
          overflow: 'hidden',
        }}
      >
        {/* Logo header */}
        <div style={{
          padding: isCollapsed ? '1.25rem 0' : (isMobile ? '1rem 1.25rem' : '1.25rem 1.5rem'),
          display: 'flex', alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          borderBottom: '1px solid var(--color-border)',
          minHeight: isMobile ? 60 : 64,
          gap: '0.5rem',
        }}>
          {/* Logo icon + text */}
          <div style={{
            display: 'flex', alignItems: 'center',
            gap: isCollapsed ? 0 : '0.625rem',
            overflow: 'hidden',
            minWidth: 0,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-400))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(99,102,241,0.3)', flexShrink: 0,
            }}>
              <TrendingUp size={20} color="white" />
            </div>
            {/* Text — hidden when collapsed */}
            {!isCollapsed && (
              <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
                <h1 style={{
                  fontSize: '1.0625rem', fontWeight: 700, lineHeight: 1.2,
                  color: 'var(--color-text-primary)',
                }}>
                  {settings?.appName || 'FinanceFlow'}
                </h1>
                <span style={{
                  fontSize: '0.6875rem', color: 'var(--color-text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  Management
                </span>
              </div>
            )}
          </div>

          {/* Close button on mobile, Collapse toggle on desktop */}
          {isMobile ? (
            <button
              onClick={onClose}
              className="btn btn-ghost btn-sm"
              style={{ padding: '0.5rem' }}
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          ) : !isCollapsed ? (
            <button
              onClick={onCollapse}
              className="btn btn-ghost btn-sm"
              style={{ padding: '0.375rem', opacity: 0.6 }}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ChevronsLeft size={16} />
            </button>
          ) : null}
        </div>

        {/* Expand button when collapsed (below header) */}
        {isCollapsed && (
          <button
            onClick={onCollapse}
            className="btn btn-ghost btn-sm"
            style={{
              margin: '0.5rem auto', padding: '0.375rem',
              opacity: 0.5,
            }}
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <ChevronsRight size={16} />
          </button>
        )}

        {/* Navigation */}
        <nav style={{
          flex: 1, padding: isCollapsed ? '0.5rem' : '0.75rem',
          overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        }}>
          {/* Section label */}
          {!isCollapsed && (
            <div style={{ marginBottom: '0.5rem', padding: '0 0.75rem' }}>
              <span style={{
                fontSize: '0.6875rem', fontWeight: 600,
                color: 'var(--color-text-muted)', textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}>
                Menu
              </span>
            </div>
          )}

          {navItems.map(item => {
            const Icon = iconMap[item.icon];
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                title={isCollapsed ? item.label : undefined}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center',
                  gap: isCollapsed ? 0 : '0.75rem',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  padding: isCollapsed
                    ? '0.75rem'
                    : (isMobile ? '0.75rem' : '0.625rem 0.75rem'),
                  borderRadius: 'var(--radius-md)',
                  fontSize: isMobile ? '0.9375rem' : 'var(--text-base)',
                  fontWeight: 500, textDecoration: 'none',
                  color: isActive ? 'var(--color-primary-400)' : 'var(--color-text-secondary)',
                  background: isActive ? 'rgba(99,102,241,0.1)' : 'transparent',
                  transition: 'all var(--transition-fast)',
                  marginBottom: '0.125rem',
                  minHeight: isMobile ? 48 : 'auto',
                  position: 'relative',
                })}
                onMouseEnter={e => {
                  if (!isMobile) {
                    e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                    e.currentTarget.style.color = 'var(--color-text-primary)';
                  }
                }}
                onMouseLeave={e => {
                  const isActive = e.currentTarget.getAttribute('aria-current') === 'page';
                  if (!isMobile && !isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }
                }}
              >
                {Icon && <Icon size={isMobile ? 20 : 18} style={{ flexShrink: 0 }} />}
                {!isCollapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* User card + Logout */}
        <div style={{
          padding: isCollapsed ? '0.5rem' : '0.75rem',
          borderTop: '1px solid var(--color-border)',
        }}>
          {/* User info — hidden when collapsed */}
          {!isCollapsed && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.625rem',
              padding: '0.625rem 0.75rem', borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg-primary)',
              marginBottom: '0.5rem',
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--text-sm)', fontWeight: 700, color: 'white', flexShrink: 0,
              }}>
                {userProfile?.displayName?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{
                  fontSize: 'var(--text-sm)', fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {userProfile?.displayName || 'User'}
                </div>
                <div style={{
                  fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)',
                  textTransform: 'capitalize',
                }}>
                  {userProfile?.role}
                </div>
              </div>
            </div>
          )}

          {/* Collapsed: just avatar */}
          {isCollapsed && (
            <div style={{
              display: 'flex', justifyContent: 'center',
              marginBottom: '0.5rem',
            }}>
              <div
                title={`${userProfile?.displayName || 'User'} (${userProfile?.role})`}
                style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'var(--text-sm)', fontWeight: 700, color: 'white',
                }}
              >
                {userProfile?.displayName?.charAt(0)?.toUpperCase() || 'U'}
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="btn btn-ghost"
            title={isCollapsed ? 'Sign Out' : undefined}
            style={{
              width: '100%',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              color: 'var(--color-danger)',
              fontSize: 'var(--text-sm)',
              minHeight: isMobile ? 48 : 'auto',
              padding: isCollapsed ? '0.625rem' : undefined,
            }}
          >
            <LogOut size={16} />
            {!isCollapsed && 'Sign Out'}
          </button>
        </div>
      </aside>
    </>
  );
}
