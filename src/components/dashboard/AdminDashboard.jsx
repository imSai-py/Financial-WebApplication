import { useState, useEffect } from 'react';
import { Users, ArrowLeftRight, IndianRupee, CheckSquare, TrendingUp, AlertCircle, Clock, Activity } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getAllUsers } from '../../services/userService';
import { getTransactions } from '../../services/transactionService';
import { getTasks } from '../../services/taskService';
import { getActivityLogs } from '../../services/activityLogService';
import StatCard from '../shared/StatCard';
import StatusBadge from '../shared/StatusBadge';
import LoadingSpinner from '../shared/LoadingSpinner';
import { formatAmount } from '../../utils/formatCurrency';
import { timeAgo } from '../../utils/formatDate';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

export default function AdminDashboard() {
  const { userProfile } = useAuth();
  const [stats, setStats] = useState({ users: [], transactions: [], tasks: [], logs: [] });
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    async function load() {
      try {
        const [users, transactions, tasks, logs] = await Promise.all([
          getAllUsers(), getTransactions(), getTasks(), getActivityLogs(),
        ]);
        setStats({ users, transactions, tasks, logs });
      } catch (err) {
        console.error('Dashboard load error:', err);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <LoadingSpinner text="Loading dashboard..." />;

  const { users, transactions, tasks, logs } = stats;
  const totalRevenue = transactions.filter(t => t.status === 'completed').reduce((sum, t) => sum + (t.amount || 0), 0);
  const pendingTasks = tasks.filter(t => t.status === 'pending').length;
  const roleCounts = users.reduce((acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; }, {});

  // Monthly chart data aggregation
  const monthlyPerf = {};
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  transactions.forEach(t => {
    if (t.status !== 'completed' || !t.amount || !t.createdAt) return;
    const d = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    const label = monthNames[d.getMonth()];
    if (!monthlyPerf[key]) monthlyPerf[key] = { month: label, revenue: 0, transactions: 0 };
    monthlyPerf[key].revenue += t.amount;
    monthlyPerf[key].transactions += 1;
  });

  const monthlyData = Object.entries(monthlyPerf)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([, v]) => v);

  const roleData = Object.entries(roleCounts).map(([name, value]) => ({ name, value }));

  return (
    <div className="animate-fade-in">
      {/* Welcome header */}
      <div style={{ marginBottom: isMobile ? '1rem' : '1.5rem' }}>
        <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.625rem', fontWeight: 800, marginBottom: '0.25rem' }}>
          Welcome back, {userProfile?.displayName?.split(' ')[0]}
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: isMobile ? '0.8125rem' : '0.9375rem' }}>
          Here's what's happening across your platform today.
        </p>
      </div>

      {/* Stat Cards — horizontal scroll on mobile */}
      {isMobile ? (
        <div style={{
          display: 'flex', gap: '0.75rem', overflowX: 'auto',
          marginBottom: '1rem', paddingBottom: '0.5rem',
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: 'x mandatory',
          msOverflowStyle: 'none', scrollbarWidth: 'none',
        }}>
          <StatCard title="Total Users" value={users.length} icon={Users} color="primary" trend="+12%" trendUp subtitle="vs last month" />
          <StatCard title="Revenue" value={formatAmount(totalRevenue)} icon={IndianRupee} color="success" trend="+8.2%" trendUp />
          <StatCard title="Transactions" value={transactions.length} icon={ArrowLeftRight} color="info" trend="+15%" trendUp />
          <StatCard title="Pending Tasks" value={pendingTasks} icon={CheckSquare} color="warning" subtitle="need attention" />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatCard title="Total Users" value={users.length} icon={Users} color="primary" trend="+12%" trendUp subtitle="vs last month" />
          <StatCard title="Total Revenue" value={formatAmount(totalRevenue)} icon={IndianRupee} color="success" trend="+8.2%" trendUp subtitle="vs last month" />
          <StatCard title="Transactions" value={transactions.length} icon={ArrowLeftRight} color="info" trend="+15%" trendUp subtitle="this month" />
          <StatCard title="Pending Tasks" value={pendingTasks} icon={CheckSquare} color="warning" subtitle="need attention" />
        </div>
      )}

      {/* Charts — stacked on mobile, side-by-side on desktop */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr',
        gap: '1rem', marginBottom: isMobile ? '1rem' : '1.5rem',
      }}>
        {/* Revenue Chart */}
        <div className="glass-card" style={{ padding: isMobile ? '1rem' : '1.25rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem' }}>Revenue Overview</h3>
          {monthlyData.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: isMobile ? 200 : 260, opacity: 0.5 }}>
              <TrendingUp size={48} style={{ marginBottom: '1rem', color: 'var(--color-text-muted)' }} />
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>No revenue data available yet.</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', marginTop: '0.25rem' }}>Revenue trails will display here.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={isMobile ? 200 : 260}>
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: isMobile ? 10 : 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: isMobile ? 10 : 12 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `₹${v/1000}k`} width={isMobile ? 45 : 60} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, fontSize: 13 }}
                  labelStyle={{ color: '#f1f5f9' }}
                  formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, 'Revenue']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* User Distribution Pie */}
        <div className="glass-card" style={{ padding: isMobile ? '1rem' : '1.25rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem' }}>User Distribution</h3>
          <ResponsiveContainer width="100%" height={isMobile ? 160 : 200}>
            <PieChart>
              <Pie data={roleData} cx="50%" cy="50%"
                outerRadius={isMobile ? 60 : 75} innerRadius={isMobile ? 35 : 45}
                dataKey="value" paddingAngle={4}>
                {roleData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, fontSize: 13 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
            {roleData.map((item, i) => (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem' }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span style={{ color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>{item.name}: {item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom panels — stacked on mobile */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: '1rem',
      }}>
        {/* Recent Transactions */}
        <div className="glass-card" style={{ padding: isMobile ? '1rem' : '1.25rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ArrowLeftRight size={16} /> Recent Transactions
          </h3>
          {transactions.slice(0, 5).length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', textAlign: 'center', padding: '1.5rem 0' }}>No transactions yet</p>
          ) : (
            transactions.slice(0, 5).map(tx => (
              <div key={tx.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: isMobile ? '0.75rem 0' : '0.625rem 0',
                borderBottom: '1px solid var(--color-border)',
                gap: '0.5rem',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: '0.8125rem', fontWeight: 500, textTransform: 'capitalize' }}>{tx.type}</p>
                  <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{timeAgo(tx.createdAt)}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>{formatAmount(tx.amount || 0)}</p>
                  <StatusBadge status={tx.status} />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Activity Logs */}
        <div className="glass-card" style={{ padding: isMobile ? '1rem' : '1.25rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={16} /> Activity Log
          </h3>
          {logs.slice(0, 5).length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', textAlign: 'center', padding: '1.5rem 0' }}>No activity recorded yet</p>
          ) : (
            logs.slice(0, 5).map(log => (
              <div key={log.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.625rem',
                padding: isMobile ? '0.75rem 0' : '0.625rem 0',
                borderBottom: '1px solid var(--color-border)',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Clock size={14} color="var(--color-primary-400)" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{log.action}</p>
                  <p style={{
                    fontSize: '0.6875rem', color: 'var(--color-text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap',
                  }}>
                    {log.details} • {timeAgo(log.timestamp)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
