import { useState, useEffect } from 'react';
import { Landmark, Clock, CheckCircle2, AlertTriangle, IndianRupee, Calendar, TrendingUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getLoansByCustomer } from '../../services/loanService';
import StatCard from '../shared/StatCard';
import StatusBadge from '../shared/StatusBadge';
import LoadingSpinner from '../shared/LoadingSpinner';
import { formatAmount } from '../../utils/formatCurrency';
import { useIsMobile } from '../../hooks/useMediaQuery';

/**
 * LoanStatus — Phase 6.3
 * 
 * Full loan management page for customers.
 * Shows active/completed loans with progress bars, EMI details,
 * and repayment timeline. Mobile-first card layout.
 */
export default function LoanStatus() {
  const { userProfile } = useAuth();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    async function load() {
      try {
        const data = await getLoansByCustomer(userProfile.uid);
        setLoans(data);
      } catch (err) {
        console.error('Loans load error:', err);
      }
      setLoading(false);
    }
    load();
  }, [userProfile.uid]);

  if (loading) return <LoadingSpinner text="Loading your loans..." />;

  const activeLoans = loans.filter(l => l.status === 'active');
  const completedLoans = loans.filter(l => l.status === 'completed');
  const totalBorrowed = loans.reduce((s, l) => s + (l.principalAmount || 0), 0);
  const totalRepaid = loans.reduce((s, l) => s + (l.totalPaid || 0), 0);
  const totalOutstanding = activeLoans.reduce((s, l) => s + (l.remainingBalance || 0), 0);

  function getProgressPercent(loan) {
    if (!loan.totalPayable || loan.totalPayable === 0) return 0;
    return Math.min(100, Math.round((loan.totalPaid || 0) / loan.totalPayable * 100));
  }

  function getProgressColor(percent) {
    if (percent >= 75) return '#22c55e';
    if (percent >= 50) return '#6366f1';
    if (percent >= 25) return '#f59e0b';
    return '#ef4444';
  }

  function getDaysUntilDue(nextDueDate) {
    if (!nextDueDate) return null;
    const due = new Date(nextDueDate);
    const now = new Date();
    const diffMs = due - now;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  function getStatusConfig(status) {
    switch (status) {
      case 'active': return { color: '#6366f1', bg: 'rgba(99,102,241,0.1)', icon: Clock, label: 'Active' };
      case 'completed': return { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: CheckCircle2, label: 'Completed' };
      case 'defaulted': return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: AlertTriangle, label: 'Defaulted' };
      case 'closed': return { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', icon: CheckCircle2, label: 'Closed' };
      default: return { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', icon: Clock, label: status };
    }
  }

  function LoanCard({ loan }) {
    const progress = getProgressPercent(loan);
    const progressColor = getProgressColor(progress);
    const statusCfg = getStatusConfig(loan.status);
    const daysUntilDue = getDaysUntilDue(loan.nextDueDate);
    const StatusIcon = statusCfg.icon;
    const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
    const isSelected = selectedLoan?.id === loan.id;

    return (
      <div
        className="glass-card"
        onClick={() => setSelectedLoan(isSelected ? null : loan)}
        style={{
          padding: isMobile ? '1rem' : '1.25rem',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          border: isSelected ? '1px solid var(--color-primary-400)' : '1px solid transparent',
          transform: isSelected ? 'scale(1.01)' : 'scale(1)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: statusCfg.bg,
            }}>
              <StatusIcon size={18} color={statusCfg.color} />
            </div>
            <div>
              <p style={{ fontSize: '0.9375rem', fontWeight: 700, textTransform: 'capitalize' }}>
                {loan.loanType || 'Personal'} Loan
              </p>
              <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                #{loan.id?.slice(0, 8).toUpperCase()}
              </p>
            </div>
          </div>
          <StatusBadge status={loan.status} />
        </div>

        {/* Progress Bar */}
        <div style={{ marginBottom: '0.875rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Repayment Progress</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: progressColor }}>{progress}%</span>
          </div>
          <div style={{
            width: '100%', height: 8, borderRadius: 4,
            background: 'rgba(148,163,184,0.1)', overflow: 'hidden',
          }}>
            <div style={{
              width: `${progress}%`, height: '100%', borderRadius: 4,
              background: `linear-gradient(90deg, ${progressColor}, ${progressColor}cc)`,
              transition: 'width 0.6s ease',
            }} />
          </div>
        </div>

        {/* EMI Info Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr',
          gap: '0.5rem',
        }}>
          <div style={{ padding: '0.5rem', borderRadius: 8, background: 'rgba(148,163,184,0.05)' }}>
            <p style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EMI</p>
            <p style={{ fontSize: '0.875rem', fontWeight: 700 }}>{formatAmount(loan.emiAmount || 0)}</p>
            <p style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>/month</p>
          </div>
          <div style={{ padding: '0.5rem', borderRadius: 8, background: 'rgba(148,163,184,0.05)' }}>
            <p style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paid</p>
            <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-success)' }}>{formatAmount(loan.totalPaid || 0)}</p>
            <p style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>
              {loan.completedEmis || 0}/{loan.tenureMonths || 0} EMIs
            </p>
          </div>
          {!isMobile && (
            <div style={{ padding: '0.5rem', borderRadius: 8, background: 'rgba(148,163,184,0.05)' }}>
              <p style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outstanding</p>
              <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-danger)' }}>{formatAmount(loan.remainingBalance || 0)}</p>
              <p style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>remaining</p>
            </div>
          )}
        </div>

        {/* Next Due Date (active loans only) */}
        {loan.status === 'active' && daysUntilDue !== null && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            marginTop: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 8,
            background: isOverdue ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.05)',
            border: isOverdue ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(99,102,241,0.1)',
          }}>
            <Calendar size={14} color={isOverdue ? '#ef4444' : '#6366f1'} />
            <span style={{ fontSize: '0.75rem', color: isOverdue ? '#ef4444' : 'var(--color-text-secondary)' }}>
              {isOverdue
                ? `Overdue by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) > 1 ? 's' : ''}`
                : `Next EMI due in ${daysUntilDue} day${daysUntilDue > 1 ? 's' : ''}`}
            </span>
          </div>
        )}

        {/* Expanded Details */}
        {isSelected && (
          <div style={{
            marginTop: '0.875rem', paddingTop: '0.875rem',
            borderTop: '1px solid var(--color-border)',
            animation: 'fadeIn 0.3s ease',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8125rem' }}>
              <div>
                <span style={{ color: 'var(--color-text-muted)' }}>Principal:</span>{' '}
                <strong>{formatAmount(loan.principalAmount || 0)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)' }}>Interest Rate:</span>{' '}
                <strong>{loan.interestRate || 0}% p.a.</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)' }}>Tenure:</span>{' '}
                <strong>{loan.tenureMonths || 0} months</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)' }}>Total Payable:</span>{' '}
                <strong>{formatAmount(loan.totalPayable || 0)}</strong>
              </div>
              {loan.description && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Note:</span>{' '}
                  <span>{loan.description}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: isMobile ? '1rem' : '1.5rem' }}>
        <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.625rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Landmark size={isMobile ? 20 : 24} /> My Loans
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: isMobile ? '0.8125rem' : '0.9375rem' }}>
          Monitor your active loans and repayment progress.
        </p>
      </div>

      {/* Stats */}
      {isMobile ? (
        <div style={{
          display: 'flex', gap: '0.75rem', overflowX: 'auto',
          marginBottom: '1rem', paddingBottom: '0.5rem',
          WebkitOverflowScrolling: 'touch', scrollSnapType: 'x mandatory',
          msOverflowStyle: 'none', scrollbarWidth: 'none',
        }}>
          <StatCard title="Active Loans" value={activeLoans.length} icon={Clock} color="primary" />
          <StatCard title="Total Borrowed" value={formatAmount(totalBorrowed)} icon={IndianRupee} color="warning" />
          <StatCard title="Total Repaid" value={formatAmount(totalRepaid)} icon={TrendingUp} color="success" />
          <StatCard title="Outstanding" value={formatAmount(totalOutstanding)} icon={AlertTriangle} color="danger" />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatCard title="Active Loans" value={activeLoans.length} icon={Clock} color="primary" />
          <StatCard title="Total Borrowed" value={formatAmount(totalBorrowed)} icon={IndianRupee} color="warning" />
          <StatCard title="Total Repaid" value={formatAmount(totalRepaid)} icon={TrendingUp} color="success" />
          <StatCard title="Outstanding" value={formatAmount(totalOutstanding)} icon={AlertTriangle} color="danger" />
        </div>
      )}

      {/* Loan Cards */}
      {loans.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <Landmark size={48} color="var(--color-text-muted)" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>No Loans Found</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            You don't have any active or past loans on your account.
          </p>
        </div>
      ) : (
        <>
          {/* Active Loans */}
          {activeLoans.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--color-text-secondary)' }}>
                Active ({activeLoans.length})
              </h2>
              <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(380px, 1fr))' }}>
                {activeLoans.map(loan => <LoanCard key={loan.id} loan={loan} />)}
              </div>
            </div>
          )}

          {/* Completed Loans */}
          {completedLoans.length > 0 && (
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--color-text-muted)' }}>
                Completed ({completedLoans.length})
              </h2>
              <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(380px, 1fr))' }}>
                {completedLoans.map(loan => <LoanCard key={loan.id} loan={loan} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
