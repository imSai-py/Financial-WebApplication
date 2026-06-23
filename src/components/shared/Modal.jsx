import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '../../hooks/useMediaQuery';

/**
 * Responsive Modal — centered dialog on desktop, full-screen bottom sheet on mobile.
 */
export default function Modal({ isOpen, onClose, title, children, maxWidth = 520 }) {
  const isMobile = useIsMobile();

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : '1rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="animate-fade-in"
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : maxWidth,
          background: 'var(--color-bg-secondary)',
          borderRadius: isMobile ? 'var(--radius-xl) var(--radius-xl) 0 0' : 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-xl)',
          maxHeight: isMobile ? '92vh' : '90vh',
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
          // Bottom sheet animation on mobile
          animation: isMobile ? 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : undefined,
        }}
      >
        {/* Header with drag handle on mobile */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          borderBottom: '1px solid var(--color-border)',
          position: 'sticky', top: 0, zIndex: 1,
          background: 'var(--color-bg-secondary)',
          borderRadius: isMobile ? 'var(--radius-xl) var(--radius-xl) 0 0' : undefined,
        }}>
          {/* Drag indicator for mobile */}
          {isMobile && (
            <div style={{
              display: 'flex', justifyContent: 'center', padding: '0.75rem 0 0.25rem',
            }}>
              <div style={{
                width: 36, height: 4, borderRadius: 2,
                background: 'var(--color-bg-tertiary)',
              }} />
            </div>
          )}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: isMobile ? '0.75rem 1.25rem 1rem' : '1.25rem 1.5rem',
          }}>
            <h3 style={{ fontSize: isMobile ? '1.125rem' : '1.125rem', fontWeight: 700 }}>
              {title}
            </h3>
            <button
              onClick={onClose}
              className="btn btn-ghost btn-sm"
              style={{
                padding: '0.5rem',
                minWidth: isMobile ? 44 : undefined,
                minHeight: isMobile ? 44 : undefined,
              }}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: isMobile ? '1.25rem' : '1.5rem' }}>
          {children}
        </div>
      </div>

      {/* Bottom sheet slide-up animation */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
}
