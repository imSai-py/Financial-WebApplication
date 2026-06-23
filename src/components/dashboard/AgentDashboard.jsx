import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IndianRupee, CheckSquare, ArrowLeftRight, TrendingUp, Target,
  Briefcase, UserPlus, Users, Eye, ChevronRight
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getTransactionsByAgent } from '../../services/transactionService';
import { getTasksByAssignee } from '../../services/taskService';
import { getCommissionsByAgent } from '../../services/commissionService';
import { getOnboardedCustomers } from '../../services/userService';
import StatCard from '../shared/StatCard';
import StatusBadge from '../shared/StatusBadge';
import LoadingSpinner from '../shared/LoadingSpinner';
import { formatAmount } from '../../utils/formatCurrency';
import { timeAgo } from '../../utils/formatDate';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function AgentDashboard() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({ transactions: [], tasks: [], commissions: [], customers: [] });
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    async function load() {
      try {
        const results = await Promise.allSettled([
          getTransactionsByAgent(userProfile.uid),
          getTasksByAssignee(userProfile.uid),
          getCommissionsByAgent(userProfile.uid),
          getOnboardedCustomers(userProfile.uid),
        ]);
        setData({
          transactions: results[0].status === 'fulfilled' ? results[0].value : [],
          tasks: results[1].status === 'fulfilled' ? results[1].value : [],
          commissions: results[2].status === 'fulfilled' ? results[2].value : [],
          customers: results[3].status === 'fulfilled' ? results[3].value : [],
        });
      } catch (err) {
        console.error('Agent dashboard error:', err);
      }
      setLoading(false);
    }
    load();
  }, [userProfile.uid]);

  if (loading) return <LoadingSpinner text="Loading dashboard..." />;

  const { tasks, commissions, customers } = data;
  const totalCommissions = commissions.filter(c => c.status === 'paid').reduce((s, c) => s + (c.amount || 0), 0);
  const pendingCommissions = commissions.filter(c => c.status === 'pending').reduce((s, c) => s + (c.amount || 0), 0);
  const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length;
  const totalCustomers = customers.length;
  const leadCount = customers.filter(c => c.customerStatus === 'lead').length;

  // ═══════════════════════════════════════════════════════
  // Real performance data from commissions (grouped by month)
  // ═══════════════════════════════════════════════════════
  const monthlyPerf = {};
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  commissions.forEach(c => {
    if (!c.createdAt) return;
    const d = c.createdAt.toDate ? c.createdAt.toDate() : new Date(c.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    const label = monthNames[d.getMonth()];
    if (!monthlyPerf[key]) monthlyPerf[key] = { month: label, earned: 0, count: 0 };
    monthlyPerf[key].earned += (c.amount || 0);
    monthlyPerf[key].count += 1;
  });

  // Sort by key and take last 6 months
  const perfData = Object.entries(monthlyPerf)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([, v]) => ({ ...v, earned: v.earned / 100 })); // paise → rupees for display

  // Quick actions
  const quickActions = [
    { label: 'Onboard Customer', icon: UserPlus, path: '/portfolio', color: '#6366f1' },
    { label: 'My Portfolio', icon: Briefcase, path: '/portfolio', color: '#10b981' },
    { label: 'My Tasks', icon: CheckSquare, path: '/tasks', color: '#f59e0b' },
    { label: 'Commissions', icon: IndianRupee, path: '/commissions', color: '#ec4899' },
  ];

  return (
    <div className="animate-fade-in">
      {/* Header with greeting */}
      <div style={{ marginBottom: isMobile ? '1rem' : '1.5rem' }}>
        <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.625rem', fontWeight: 800, marginBottom: '0.25rem' }}>
          Welcome back, {userProfile?.displayName?.split(' ')[0] || 'Agent'} 👋
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: isMobile ? '0.8125rem' : '0.9375rem' }}>
          Track your portfolio, commissions, and assigned tasks.
        </p>
      </div>

      {/* Quick Actions Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: '0.625rem', marginBottom: isMobile ? '1rem' : '1.25rem',
      }}>
        {quickActions.map(action => (
          <button
            key={action.label}
            onClick={() => navigate(action.path)}
            className="glass-card"
            style={{
              padding: isMobile ? '0.75rem' : '0.875rem',
              display: 'flex', alignItems: 'center', gap: '0.625rem',
              cursor: 'pointer', border: '1px solid var(--color-border)',
              transition: 'all 0.2s ease', background: 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius-md)',
              minHeight: isMobile ? 48 : 'auto',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = action.color;
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = `0 4px 12px ${action.color}20`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 'var(--radius-sm)',
              background: `${action.color}15`, display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <action.icon size={16} color={action.color} />
            </div>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{action.label}</span>
          </button>
        ))}
      </div>

      {/* Stat Cards */}
      {isMobile ? (
        <div style={{
          display: 'flex', gap: '0.75rem', overflowX: 'auto',
          marginBottom: '1rem', paddingBottom: '0.5rem',
          WebkitOverflowScrolling: 'touch', scrollSnapType: 'x mandatory',
          msOverflowStyle: 'none', scrollbarWidth: 'none',
        }}>
          <StatCard title="Portfolio" value={totalCustomers} icon={Users} color="primary" subtitle={`${leadCount} leads`} />
          <StatCard title="Earned" value={formatAmount(totalCommissions)} icon={IndianRupee} color="success" />
          <StatCard title="Pending" value={formatAmount(pendingCommissions)} icon={TrendingUp} color="warning" />
          <StatCard title="Tasks" value={activeTasks} icon={CheckSquare} color="info" />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatCard title="My Portfolio" value={totalCustomers} icon={Users} color="primary" subtitle={`${leadCount} leads`} />
          <StatCard title="Total Earned" value={formatAmount(totalCommissions)} icon={IndianRupee} color="success" />
          <StatCard title="Pending Payout" value={formatAmount(pendingCommissions)} icon={TrendingUp} color="warning" />
          <StatCard title="Active Tasks" value={activeTasks} icon={CheckSquare} color="info" />
        </div>
      )}

      {/* Portfolio Summary + Performance Chart — side by side on desktop */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr',
        gap: '1rem', marginBottom: isMobile ? '1rem' : '1.5rem',
      }}>
        {/* Portfolio Summary */}
        <div className="glass-card" style={{ padding: isMobile ? '1rem' : '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Briefcase size={16} /> Portfolio
            </h3>
            <button
              onClick={() => navigate('/portfolio')}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.6875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              View All <ChevronRight size={12} />
            </button>
          </div>

          {/* Recent customers */}
          {customers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>No customers yet</p>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => navigate('/portfolio')}
              >
                <UserPlus size={14} /> Onboard First Customer
              </button>
            </div>
          ) : (
            <div>
              {customers.slice(0, 4).map(c => (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.625rem',
                  padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)',
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: c.hasAuthAccount
                      ? 'linear-gradient(135deg, rgba(16,185,129,0.4), rgba(16,185,129,0.2))'
                      : 'linear-gradient(135deg, rgba(245,158,11,0.4), rgba(245,158,11,0.15))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.6875rem', fontWeight: 700,
                    color: c.hasAuthAccount ? '#34d399' : '#fbbf24',
                    flexShrink: 0,
                  }}>
                    {c.displayName?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.8125rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.displayName}
                    </p>
                    <p style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>
                      {c.hasAuthAccount ? 'Active' : 'Lead'} · {timeAgo(c.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
              {customers.length > 4 && (
                <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '0.625rem 0' }}>
                  +{customers.length - 4} more
                </p>
              )}
            </div>
          )}
        </div>

        {/* Performance Chart */}
        <div className="glass-card" style={{ padding: isMobile ? '1rem' : '1.25rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Target size={16} /> Commission Earnings
          </h3>
          {perfData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>No commission data yet</p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                Commissions are auto-generated at 2% when your customers create transactions
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={isMobile ? 200 : 220}>
              <BarChart data={perfData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: isMobile ? 10 : 12 }} axisLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: isMobile ? 10 : 12 }} axisLine={false}
                  tickFormatter={v => `₹${v >= 1000 ? (v/1000).toFixed(0) + 'k' : v}`} width={isMobile ? 45 : 55} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8 }}
                  formatter={(val) => [`₹${val.toLocaleString('en-IN')}`, 'Earned']}
                />
                <Bar dataKey="earned" fill="#10b981" radius={[4,4,0,0]} name="Earned" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bottom panels: Commissions + Tasks */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: '1rem',
      }}>
        {/* Recent Commissions */}
        <div className="glass-card" style={{ padding: isMobile ? '1rem' : '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <IndianRupee size={16} /> Recent Commissions
            </h3>
            <button
              onClick={() => navigate('/commissions')}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.6875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              View All <ChevronRight size={12} />
            </button>
          </div>
          {commissions.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', textAlign: 'center', padding: '1.5rem 0' }}>
              No commissions yet. Commissions are auto-created at 2% when customers transact.
            </p>
          ) : (
            commissions.slice(0, 5).map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: isMobile ? '0.75rem 0' : '0.625rem 0',
                borderBottom: '1px solid var(--color-border)',
                gap: '0.5rem',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                    {c.description || `Commission @ ${c.rate}%`}
                  </p>
                  <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{timeAgo(c.createdAt)}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-success)' }}>+{formatAmount(c.amount || 0)}</p>
                  <StatusBadge status={c.status} />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Active Tasks */}
        <div className="glass-card" style={{ padding: isMobile ? '1rem' : '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckSquare size={16} /> Active Tasks
            </h3>
            <button
              onClick={() => navigate('/tasks')}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.6875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              View All <ChevronRight size={12} />
            </button>
          </div>
          {tasks.filter(t => t.status !== 'completed').length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', textAlign: 'center', padding: '1.5rem 0' }}>All tasks completed! 🎉</p>
          ) : (
            tasks.filter(t => t.status !== 'completed').slice(0, 5).map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: isMobile ? '0.75rem 0' : '0.625rem 0',
                borderBottom: '1px solid var(--color-border)',
                gap: '0.5rem',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{t.title}</p>
                  <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                    Priority: <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{t.priority}</span>
                    {t.dueDate && ` · Due: ${t.dueDate}`}
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
