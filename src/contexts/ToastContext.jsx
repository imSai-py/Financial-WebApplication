import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle, X } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const TOAST_ICONS = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

const TOAST_COLORS = {
  success: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.25)', text: '#34d399', icon: '#10b981' },
  warning: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.25)', text: '#fbbf24', icon: '#f59e0b' },
  error:   { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.25)', text: '#f87171', icon: '#ef4444' },
  info:    { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.25)', text: '#60a5fa', icon: '#3b82f6' },
};

const AUTO_DISMISS_MS = 4500;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.map(t =>
      t.id === id ? { ...t, exiting: true } : t
    ));
    // Remove from DOM after exit animation completes
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 300);
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    const id = ++toastIdRef.current;
    const toast = { id, message, type, exiting: false };

    setToasts(prev => [...prev, toast]);

    // Auto-dismiss
    setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);

    return id;
  }, [dismissToast]);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}

      {/* Toast container — fixed top-right */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          aria-atomic="false"
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.625rem',
            pointerEvents: 'none',
            maxWidth: 420,
            width: 'calc(100vw - 40px)',
          }}
        >
          {toasts.map(toast => {
            const colors = TOAST_COLORS[toast.type] || TOAST_COLORS.info;
            const Icon = TOAST_ICONS[toast.type] || Info;
            return (
              <div
                key={toast.id}
                role="alert"
                className={toast.exiting ? 'toast-exit' : 'toast-enter'}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  padding: '0.875rem 1rem',
                  borderRadius: 'var(--radius-lg)',
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                  pointerEvents: 'auto',
                  cursor: 'default',
                }}
              >
                <Icon size={18} color={colors.icon} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{
                  flex: 1,
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: colors.text,
                  lineHeight: 1.5,
                }}>
                  {toast.message}
                </span>
                <button
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Dismiss notification"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 2,
                    color: colors.text,
                    opacity: 0.6,
                    flexShrink: 0,
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ToastContext.Provider>
  );
}
