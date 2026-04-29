export default function LoadingSpinner({ size = 40, text = 'Loading...' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '3rem', gap: '1rem',
    }}>
      <div style={{
        width: size, height: size,
        border: '3px solid var(--color-bg-tertiary)',
        borderTop: '3px solid var(--color-primary-500)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      {text && <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{text}</p>}
    </div>
  );
}
