import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { TrendingUp, Mail, ArrowLeft, CheckCircle } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { resetPassword } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset email.');
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg-primary)', padding: '2rem',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }} className="animate-fade-in">
        <div style={{
          width: 56, height: 56, borderRadius: 'var(--radius-lg)',
          background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-400))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1.5rem', boxShadow: '0 4px 16px rgba(99,102,241,0.25)',
        }}>
          <TrendingUp size={28} color="white" />
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle size={48} color="var(--color-success)" style={{ margin: '0 auto 1rem' }} />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Check your email</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem' }}>
              We've sent a password reset link to <strong style={{ color: 'var(--color-text-primary)' }}>{email}</strong>
            </p>
            <Link to="/login" className="btn btn-primary" style={{ textDecoration: 'none' }}>
              <ArrowLeft size={16} /> Back to Sign In
            </Link>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: '1.625rem', fontWeight: 700, marginBottom: '0.375rem', textAlign: 'center' }}>
              Reset Password
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem', textAlign: 'center', fontSize: '0.9375rem' }}>
              Enter your email and we'll send you a reset link
            </p>

            {error && (
              <div style={{
                padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                color: '#f87171', fontSize: '0.8125rem', marginBottom: '1.25rem',
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="input" id="forgot-email" required
                    placeholder="you@example.com"
                    style={{ paddingLeft: 38 }}
                  />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn btn-primary btn-lg" id="forgot-submit" style={{ width: '100%' }}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem' }}>
              <Link to="/login" style={{ color: 'var(--color-primary-400)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                <ArrowLeft size={14} /> Back to Sign In
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
