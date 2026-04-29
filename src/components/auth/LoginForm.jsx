import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useSettings } from '../../contexts/SettingsContext';
import { TrendingUp, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const profile = await login(email, password);

      // Welcome toast (Improvement 3) — confirms role for security awareness
      const name = profile.displayName || 'User';
      const role = profile.role?.charAt(0).toUpperCase() + profile.role?.slice(1);
      showToast(`Welcome back, ${name}! Signed in as ${role}.`, 'success');

      navigate('/dashboard', { replace: true });
    } catch (err) {
      const map = {
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
        'auth/invalid-credential': 'Invalid email or password.',
      };
      setError(map[err.code] || err.message || 'Login failed.');
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      background: 'var(--color-bg-primary)',
    }}>
      {/* Left panel - Branding */}
      <div className="login-brand-panel" style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', padding: '3rem',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 30%, #3730a3 60%, #1e293b 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Animated background orbs */}
        <div style={{
          position: 'absolute', width: 300, height: 300, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.15), transparent)',
          top: -50, right: -50, animation: 'pulse-glow 4s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', width: 200, height: 200, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.1), transparent)',
          bottom: -30, left: -30, animation: 'pulse-glow 5s ease-in-out infinite 1s',
        }} />

        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 400 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 'var(--radius-xl)',
            background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-400))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem', boxShadow: '0 8px 32px rgba(99,102,241,0.3)',
          }}>
            <TrendingUp size={36} color="white" />
          </div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'white', marginBottom: '0.75rem' }}>
            {settings?.appName || 'FinanceFlow'}
          </h1>
          <p style={{ fontSize: '1.0625rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
            Secure financial management platform for your business operations
          </p>
        </div>
      </div>

      {/* Right panel - Form */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem 1.5rem',
      }}>
        <div style={{ width: '100%', maxWidth: 420 }} className="animate-fade-in">
          {/* Mobile-only branding (brand panel is hidden on mobile) */}
          <div className="mobile-brand-header" style={{ display: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              marginBottom: '2rem', justifyContent: 'center',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-400))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
              }}>
                <TrendingUp size={24} color="white" />
              </div>
              <div>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.2 }}>FinanceFlow</h1>
                <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Management</span>
              </div>
            </div>
          </div>

          <h2 style={{ fontSize: '1.625rem', fontWeight: 700, marginBottom: '0.375rem' }}>Welcome back</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem', fontSize: '0.9375rem' }}>
            Sign in to your account to continue
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
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="input" id="login-email" required
                  placeholder="you@example.com"
                  style={{ paddingLeft: 38 }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                  Password
                </label>
                <Link to="/forgot-password" style={{ fontSize: '0.8125rem', color: 'var(--color-primary-400)', textDecoration: 'none' }}>
                  Forgot password?
                </Link>
              </div>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input
                  type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input" id="login-password" required
                  placeholder="Enter your password"
                  style={{ paddingLeft: 38, paddingRight: 48 }}
                />
                <button
                  type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                    padding: 8, minWidth: 40, minHeight: 40,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="btn btn-primary btn-lg"
              id="login-submit"
              style={{ width: '100%', fontSize: '0.9375rem' }}
            >
              {loading ? (
                <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
              ) : (
                <>Sign In <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: 'var(--color-primary-400)', textDecoration: 'none', fontWeight: 600 }}>
              Create account
            </Link>
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .login-brand-panel { display: none !important; }
          .mobile-brand-header { display: block !important; }
        }
      `}</style>
    </div>
  );
}
