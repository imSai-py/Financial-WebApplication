import { useState, useEffect } from 'react';
import { IndianRupee, ArrowDownLeft, ArrowUpRight, Clock, Send, Landmark, ArrowRight, CreditCard, TrendingUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getTransactionsByCustomer, getCustomerBalance } from '../../services/transactionService';
import { getActiveLoans } from '../../services/loanService';
import StatCard from '../shared/StatCard';
import StatusBadge from '../shared/StatusBadge';
import LoadingSpinner from '../shared/LoadingSpinner';
import PaymentForm from '../payments/PaymentForm';
import { formatAmount } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

/**
 * CustomerDashboard — Phase 6.3 (Enhanced)
 * 
 * Capabilities:
 *   1. Profile greeting + balance overview
 *   2. Quick Actions bar (Pay, Transfer, View Loans)
 *   3. Active loans summary with progress
 *   4. Monthly activity chart
 *   5. Recent transaction feed
 */
export default function CustomerDashboard() {
  const { userProfile } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [activeLoans, setActiveLoans] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentType, setPaymentType] = useState('payment');
  const isMobile = useIsMobile();

  async function loadData() {
    try {
      const [txs, loans, bal] = await Promise.all([
        getTransactionsByCustomer(userProfile.uid),
        getActiveLoans(userProfile.uid),
        getCustomerBalance(userProfile.uid),
      ]);
      setTransactions(txs);
      setActiveLoans(loans);
      setBalance(bal);
    } catch (err) {
      console.error('Customer dashboard error:', err);
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [userProfile.uid]);

  function handlePaymentSuccess() {
    // Refresh data after successful payment
    setShowPayment(false);
    setLoading(true);
    loadData();
  }

  function openPayment(type) {
    setPaymentType(type);
    setShowPayment(true);
  }

  if (loading) return <LoadingSpinner text="Loading your account..." />;

  const deposits = transactions.filter(t => t.type === 'deposit' && t.status === 'completed').reduce((s, t) => s + (t.amount || 0), 0);
  const withdrawals = transactions.filter(t => (t.type === 'withdrawal' || t.type === 'payment' || t.type === 'transfer') && t.status === 'completed').reduce((s, t) => s + (t.amount || 0), 0);
  const pendingTx = transactions.filter(t => t.status === 'pending').length;

  // Monthly summary for chart
  const monthlyMap = {};
  transactions.forEach(tx => {
    const d = tx.createdAt?.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt);
    const key = d.toLocaleString('en', { month: 'short' });
    if (!monthlyMap[key]) monthlyMap[key] = { month: key, inflow: 0, outflow: 0 };
    if (['deposit', 'refund'].includes(tx.type) && tx.status === 'completed') monthlyMap[key].inflow += tx.amount || 0;
    if (['withdrawal', 'payment', 'transfer'].includes(tx.type) && tx.status === 'completed') monthlyMap[key].outflow += tx.amount || 0;
  });
  const chartData = Object.values(monthlyMap).slice(-6);

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div className="animate-fade-in">
      {/* Greeting */}
      <div style={{ marginBottom: isMobile ? '1rem' : '1.5rem' }}>
        <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.625rem', fontWeight: 800, marginBottom: '0.25rem' }}>
          {greeting}, {userProfile?.displayName?.split(' ')[0] || 'there'} 👋
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: isMobile ? '0.8125rem' : '0.9375rem' }}>
          Here's your financial overview.
        </p>
      </div>

      {/* Stat Cards */}
      {isMobile ? (
        <div style={{
          display: 'flex', gap: '0.75rem', overflowX: 'auto',
          marginBottom: '1rem', paddingBottom: '0.5rem',
          WebkitOverflowScrolling: 'touch', scrollSnapType: 'x mandatory',
          msOverflowStyle: 'none', scrollbarWidth: 'none',
        }}>
          <StatCard title="Balance" value={formatAmount(balance)} icon={IndianRupee} color="success" />
          <StatCard title="Inflow" value={formatAmount(deposits)} icon={ArrowDownLeft} color="primary" />
          <StatCard title="Outflow" value={formatAmount(withdrawals)} icon={ArrowUpRight} color="danger" />
          <StatCard title="Pending" value={pendingTx} icon={Clock} color="warning" />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatCard title="Account Balance" value={formatAmount(balance)} icon={IndianRupee} color="success" />
          <StatCard title="Total Inflow" value={formatAmount(deposits)} icon={ArrowDownLeft} color="primary" />
          <StatCard title="Total Outflow" value={formatAmount(withdrawals)} icon={ArrowUpRight} color="danger" />
          <StatCard title="Pending" value={pendingTx} icon={Clock} color="warning" subtitle="transactions" />
        </div>
      )}

      {/* Quick Actions */}
      <div className="glass-card" style={{
        padding: isMobile ? '0.875rem' : '1rem',
        marginBottom: isMobile ? '1rem' : '1.5rem',
      }}>
        <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Quick Actions
        </h3>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: isMobile ? 'auto' : 'visible' }}>
          {[
            { label: 'Pay', icon: CreditCard, color: '#6366f1', bg: 'rgba(99,102,241,0.1)', action: () => openPayment('payment') },
            { label: 'Transfer', icon: Send, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', action: () => openPayment('transfer') },
            { label: 'My Loans', icon: Landmark, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', action: () => window.location.href = '/loans' },
            { label: 'History', icon: TrendingUp, color: '#22c55e', bg: 'rgba(34,197,94,0.1)', action: () => window.location.href = '/transactions' },
          ].map(item => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem',
                padding: '0.875rem 1.25rem', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: item.bg, minWidth: isMobile ? 80 : 'auto', flexShrink: 0,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
              id={`quick-action-${item.label.toLowerCase().replace(/\s/g, '-')}`}
            >
              <item.icon size={22} color={item.color} />
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: item.color }}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active Loans Summary */}
      {activeLoans.length > 0 && (
        <div className="glass-card" style={{ padding: isMobile ? '1rem' : '1.25rem', marginBottom: isMobile ? '1rem' : '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Landmark size={18} /> Active Loans
            </h3>
            <a href="/loans" style={{ fontSize: '0.75rem', color: 'var(--color-primary-400)', display: 'flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none' }}>
              View All <ArrowRight size={14} />
            </a>
          </div>
          {activeLoans.slice(0, 3).map(loan => {
            const progress = loan.totalPayable ? Math.min(100, Math.round((loan.totalPaid || 0) / loan.totalPayable * 100)) : 0;
            return (
              <div key={loan.id} style={{
                padding: '0.75rem', borderRadius: 10, marginBottom: '0.5rem',
                background: 'rgba(148,163,184,0.03)', border: '1px solid var(--color-border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'capitalize' }}>
                    {loan.loanType || 'Personal'} Loan
                  </span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700 }}>
                    {formatAmount(loan.emiAmount || 0)}/mo
                  </span>
                </div>
                <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(148,163,184,0.1)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${progress}%`, height: '100%', borderRadius: 3,
                    background: progress >= 75 ? '#22c55e' : progress >= 50 ? '#6366f1' : '#f59e0b',
                    transition: 'width 0.6s ease',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>
                    {formatAmount(loan.totalPaid || 0)} paid
                  </span>
                  <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>
                    {progress}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="glass-card" style={{ padding: isMobile ? '1rem' : '1.25rem', marginBottom: isMobile ? '1rem' : '1.5rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem' }}>Monthly Activity</h3>
          <ResponsiveContainer width="100%" height={isMobile ? 200 : 240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: isMobile ? 10 : 12 }} axisLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: isMobile ? 10 : 12 }} axisLine={false}
                tickFormatter={v => `₹${v/100}`} width={isMobile ? 45 : 60} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8 }} />
              <Bar dataKey="inflow" fill="#6366f1" radius={[4,4,0,0]} name="Inflow" />
              <Bar dataKey="outflow" fill="#ef4444" radius={[4,4,0,0]} name="Outflow" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="glass-card" style={{ padding: isMobile ? '1rem' : '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700 }}>Recent Transactions</h3>
          <a href="/transactions" style={{ fontSize: '0.75rem', color: 'var(--color-primary-400)', display: 'flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none' }}>
            View All <ArrowRight size={14} />
          </a>
        </div>
        {transactions.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>
            No transactions found.
          </p>
        ) : (
          transactions.slice(0, 8).map(tx => {
            const isInflow = ['deposit', 'refund'].includes(tx.type);
            return (
              <div key={tx.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: isMobile ? '0.875rem 0' : '0.75rem 0',
                borderBottom: '1px solid var(--color-border)',
                gap: '0.75rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                  <div style={{
                    width: isMobile ? 40 : 36, height: isMobile ? 40 : 36,
                    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isInflow ? 'rgba(99,102,241,0.1)' : 'rgba(239,68,68,0.1)',
                    flexShrink: 0,
                  }}>
                    {isInflow
                      ? <ArrowDownLeft size={18} color="var(--color-primary-400)" />
                      : <ArrowUpRight size={18} color="var(--color-danger)" />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '0.875rem', fontWeight: 500, textTransform: 'capitalize' }}>{tx.type}</p>
                    <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.description || formatDate(tx.createdAt)}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{
                    fontSize: isMobile ? '0.875rem' : '0.9375rem', fontWeight: 700,
                    color: isInflow ? 'var(--color-success)' : 'var(--color-danger)',
                  }}>
                    {isInflow ? '+' : '-'}{formatAmount(tx.amount || 0)}
                  </p>
                  <StatusBadge status={tx.status} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Payment Modal */}
      <PaymentForm
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
}
