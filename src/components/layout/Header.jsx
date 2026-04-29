import { Menu, Bell, Search, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useIsMobile, useIsSmallMobile } from '../../hooks/useMediaQuery';
import { subscribeToNotifications, markAsRead, markAllAsRead } from '../../services/notificationService';
import SearchOverlay from './SearchOverlay';

export default function Header({ onMenuToggle }) {
  const { userProfile } = useAuth();
  const isMobile = useIsMobile();
  const isSmallMobile = useIsSmallMobile();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef(null);

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!userProfile?.uid) return;
    
    const unsubscribe = subscribeToNotifications(userProfile.uid, (notifs, unread) => {
      setNotifications(notifs);
      setUnreadCount(unread);
    });

    return () => unsubscribe();
  }, [userProfile?.uid]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header style={{
      height: isMobile ? 56 : 64,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: isMobile ? '0 1rem' : '0 1.5rem',
      background: 'var(--color-bg-secondary)',
      borderBottom: '1px solid var(--color-border)',
      position: 'sticky',
      top: 0,
      zIndex: 30,
      gap: '0.5rem',
    }}>
      {/* Left section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.5rem' : '1rem', flex: 1, minWidth: 0 }}>
        {/* Hamburger — always visible on mobile */}
        {isMobile && (
          <button
            onClick={onMenuToggle}
            className="btn btn-ghost btn-sm"
            style={{ padding: '0.5rem', flexShrink: 0 }}
            aria-label="Open menu"
            id="header-menu-toggle"
          >
            <Menu size={22} />
          </button>
        )}

        {/* Search bar — expandable on mobile */}
        {(!isSmallMobile || searchOpen) && (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: isMobile ? 1 : undefined }}>
            <Search size={16} style={{
              position: 'absolute', left: 12,
              color: 'var(--color-text-muted)',
            }} />
            <input
              type="text"
              placeholder="Search..."
              className="input"
              id="header-search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: isMobile ? '100%' : 280,
                paddingLeft: 36,
                fontSize: isMobile ? '1rem' : '0.8125rem',
                background: 'var(--color-bg-primary)',
                minHeight: isMobile ? 44 : undefined,
              }}
            />
            {isSmallMobile && searchOpen && (
               <button 
                onClick={() => { setSearchOpen(false); setSearchTerm(''); }}
                style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}
              >
                <X size={18} />
              </button>
            )}
            <SearchOverlay searchTerm={searchTerm} onClose={() => setSearchTerm('')} />
          </div>
        )}
        
        {isSmallMobile && !searchOpen && (
          <button onClick={() => setSearchOpen(true)} className="btn btn-ghost btn-sm" style={{ padding: '0.5rem', marginLeft: 'auto' }}>
            <Search size={20} />
          </button>
        )}
      </div>

      {/* Right section — compact on mobile */}
      {!(isSmallMobile && searchOpen) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.375rem' : '0.75rem', flexShrink: 0 }}>
          
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button className="btn btn-ghost btn-sm" id="header-notifications"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              style={{ position: 'relative', padding: '0.5rem' }}>
              <Bell size={isMobile ? 20 : 18} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: 2, right: 4,
                  minWidth: 16, height: 16, borderRadius: 8,
                  background: 'var(--color-danger)', color: 'white',
                  fontSize: '0.625rem', fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 4px'
                }}>
                  {unreadCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
               <div style={{
                position: 'absolute', 
                top: '120%', right: 0, width: 320,
                background: 'var(--color-bg-primary)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                zIndex: 100, overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
                maxHeight: 400
              }}>
                <div style={{ 
                  padding: '1rem', borderBottom: '1px solid var(--color-border)', 
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center' 
                }}>
                  <span style={{ fontWeight: 600 }}>Notifications</span>
                  {unreadCount > 0 && (
                    <button 
                      onClick={() => markAllAsRead(userProfile.uid)}
                      style={{ fontSize: '0.75rem', color: 'var(--color-primary-500)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {notifications.length > 0 ? (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {notifications.map((notif) => (
                        <li 
                          key={notif.id}
                          onClick={() => {
                            if (!notif.isRead) markAsRead(userProfile.uid, notif.id);
                          }}
                          style={{
                            padding: '1rem',
                            borderBottom: '1px solid var(--color-border)',
                            background: notif.isRead ? 'transparent' : 'var(--color-surface)',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ fontSize: '0.8125rem', fontWeight: notif.isRead ? 400 : 600, color: 'var(--color-text-primary)' }}>
                            {notif.title}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                            {notif.message}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                      You have no notifications.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: isMobile ? '0.25rem 0.375rem' : '0.375rem 0.625rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border)',
          }}>
            <div style={{
              width: isMobile ? 28 : 30, height: isMobile ? 28 : 30, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem', fontWeight: 700, color: 'white', flexShrink: 0,
            }}>
              {userProfile?.displayName?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            {/* Hide name on small mobile to save space */}
            {!isSmallMobile && (
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                  {userProfile?.displayName || 'User'}
                </div>
                <div style={{ fontSize: '0.625rem', color: 'var(--color-primary-400)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
                  {userProfile?.role}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
