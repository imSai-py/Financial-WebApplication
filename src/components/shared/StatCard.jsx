import { useIsMobile } from '../../hooks/useMediaQuery';

export default function StatCard({ title, value, subtitle, icon: Icon, trend, trendUp, color = 'primary' }) {
  const isMobile = useIsMobile();

  const colors = {
    primary: { bg: 'rgba(99,102,241,0.1)', icon: 'var(--color-primary-400)', border: 'rgba(99,102,241,0.2)' },
    success: { bg: 'rgba(16,185,129,0.1)', icon: 'var(--color-success)', border: 'rgba(16,185,129,0.2)' },
    warning: { bg: 'rgba(245,158,11,0.1)', icon: 'var(--color-warning)', border: 'rgba(245,158,11,0.2)' },
    danger: { bg: 'rgba(239,68,68,0.1)', icon: 'var(--color-danger)', border: 'rgba(239,68,68,0.2)' },
    info: { bg: 'rgba(59,130,246,0.1)', icon: 'var(--color-info)', border: 'rgba(59,130,246,0.2)' },
  };
  const c = colors[color] || colors.primary;

  return (
    <div className="glass-card" style={{
      padding: isMobile ? '1rem 1.125rem' : '1.25rem 1.5rem',
      minWidth: isMobile ? 200 : undefined,
      flex: isMobile ? '0 0 auto' : undefined,
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: isMobile ? '0.5rem' : '0.75rem',
      }}>
        <div style={{ minWidth: 0 }}>
          <p style={{
            fontSize: isMobile ? '0.75rem' : '0.8125rem',
            color: 'var(--color-text-muted)', fontWeight: 500,
            marginBottom: '0.25rem',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {title}
          </p>
          <h3 style={{
            fontSize: isMobile ? '1.375rem' : '1.75rem',
            fontWeight: 800, lineHeight: 1.1,
          }}>
            {value}
          </h3>
        </div>
        {Icon && (
          <div style={{
            width: isMobile ? 38 : 44, height: isMobile ? 38 : 44,
            borderRadius: 'var(--radius-md)',
            background: c.bg, border: `1px solid ${c.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Icon size={isMobile ? 18 : 22} color={c.icon} />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        {trend && (
          <span style={{
            fontSize: '0.75rem', fontWeight: 600,
            color: trendUp ? 'var(--color-success)' : 'var(--color-danger)',
            display: 'flex', alignItems: 'center', gap: '0.125rem',
          }}>
            {trendUp ? '↑' : '↓'} {trend}
          </span>
        )}
        {subtitle && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
