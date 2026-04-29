import { useState, useEffect } from 'react';
import { ArrowLeftRight, CheckSquare, Users, Clock, TrendingUp, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getTransactions } from '../../services/transactionService';
import { getTasksByAssignee } from '../../services/taskService';
import { getCustomersByStaff } from '../../services/userService';
import StatCard from '../shared/StatCard';
import StatusBadge from '../shared/StatusBadge';
import LoadingSpinner from '../shared/LoadingSpinner';
import { formatAmount } from '../../utils/formatCurrency';
import { timeAgo } from '../../utils/formatDate';
import { useIsMobile } from '../../hooks/useMediaQuery';

export default function StaffDashboard() {
  const { userProfile } = useAuth();
  const [data, setData] = useState({ transactions: [], tasks: [], customers: [] });
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    async function load() {
      try {
        const [transactions, tasks, customers] = await Promise.all([
          getTransactions(userProfile),              // SCOPED: staffId || assignedStaffId
          getTasksByAssignee(userProfile.uid),        // SCOPED: assignedTo == uid
          getCustomersByStaff(userProfile.uid),       // SCOPED: assignedStaffId == uid
        ]);
        setData({ transactions, tasks, customers });
      } catch (err) {
        console.error('Staff dashboard error:', err);
      }
      setLoading(false);
    }
    load();
  }, [userProfile.uid]);

  if (loading) return <LoadingSpinner text="Loading dashboard..." />;

  const { transactions, tasks, customers } = data;
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const completionRate = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;
  const pendingTx = transactions.filter(t => t.status === 'pending');
  const totalRevenue = transactions
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: isMobile ? '1rem' : '1.5rem' }}>
        <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.625rem', fontWeight: 800, marginBottom: '0.25rem' }}>
          Staff Dashboard
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: isMobile ? '0.8125rem' : '0.9375rem' }}>
          Welcome back, {userProfile.displayName}. Here's your work overview.
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
          <StatCard title="My Customers" value={customers.length} icon={Users} color="primary" />
          <StatCard title="Total TX" value={transactions.length} icon={ArrowLeftRight} color="info" />
          <StatCard title="Revenue" value={formatAmount(totalRevenue)} icon={TrendingUp} color="success" />
          <StatCard title="Pending Tasks" value={pendingTasks.length} icon={Clock} color="warning" />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatCard title="My Customers" value={customers.length} icon={Users} color="primary" />
          <StatCard title="Transactions" value={transactions.length} icon={ArrowLeftRight} color="info" />
          <StatCard title="Revenue Processed" value={formatAmount(totalRevenue)} icon={TrendingUp} color="success" />
          <StatCard title="Pending Tasks" value={pendingTasks.length} icon={Clock} color="warning" />
        </div>
      )}

      {/* Quick Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: '0.75rem', marginBottom: '1.25rem',
      }}>
        {[
          { label: 'Task Completion', value: `${completionRate}%`, color: completionRate >= 80 ? '#10b981' : completionRate >= 50 ? '#f59e0b' : '#ef4444' },
          { label: 'Pending TX', value: pendingTx.length, color: pendingTx.length > 5 ? '#f59e0b' : '#10b981' },
          { label: 'Completed Tasks', value: completedTasks.length, color: '#6366f1' },
          { label: 'Total Tasks', value: tasks.length, color: '#8b5cf6' },
        ].map(item => (
          <div key={item.label} className="glass-card" style={{
            padding: isMobile ? '0.75rem' : '1rem', textAlign: 'center',
          }}>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: item.color }}>{item.value}</p>
            <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>{item.label}</p>
          </div>
        ))}
      </div>

      {/* Panels — stacked on mobile */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: '1rem',
      }}>
        {/* Pending Tasks */}
        <div className="glass-card" style={{ padding: isMobile ? '1rem' : '1.25rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckSquare size={16} /> Your Tasks
            {pendingTasks.length > 0 && (
              <span className="badge badge-warning" style={{ fontSize: '0.625rem' }}>{pendingTasks.length}</span>
            )}
          </h3>
          {pendingTasks.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', textAlign: 'center', padding: '1.5rem 0' }}>
              🎉 All tasks completed!
            </p>
          ) : (
            pendingTasks.slice(0, 6).map(task => (
              <div key={task.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: isMobile ? '0.75rem 0' : '0.625rem 0',
                borderBottom: '1px solid var(--color-border)',
                gap: '0.5rem',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    {(task.priority === 'urgent' || task.priority === 'high') && (
                      <AlertTriangle size={12} color={task.priority === 'urgent' ? 'var(--color-danger)' : 'var(--color-warning)'} />
                    )}
                    <p style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{task.title}</p>
                  </div>
                  <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                    Priority: {task.priority} {task.dueDate ? `· Due: ${task.dueDate}` : ''}
                  </p>
                </div>
                <StatusBadge status={task.status} />
              </div>
            ))
          )}
        </div>

        {/* Recent Transactions */}
        <div className="glass-card" style={{ padding: isMobile ? '1rem' : '1.25rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ArrowLeftRight size={16} /> Recent Transactions
          </h3>
          {transactions.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', textAlign: 'center', padding: '1.5rem 0' }}>No transactions yet</p>
          ) : (
            transactions.slice(0, 6).map(tx => (
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
      </div>
    </div>
  );
}
