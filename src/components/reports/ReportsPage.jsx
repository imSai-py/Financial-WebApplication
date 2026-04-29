import { useState, useEffect } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, AlertTriangle,
  ShieldCheck, Users, DollarSign, Activity, Award,
  UserPlus, Clock, XCircle, CheckSquare, ListChecks
} from 'lucide-react';
import { generateReport, getStaffMetrics } from '../../services/reportService';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../shared/LoadingSpinner';
import usePageTitle from '../../hooks/usePageTitle';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { formatAmount } from '../../utils/formatCurrency';

function formatCurrency(amount) {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

function ReportStatCard({ icon: Icon, label, value, subtext, color, trend }) {
  return (
    <div className="glass-card" style={{
      padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 'var(--radius-md)',
          background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} color={color} />
        </div>
        {trend && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.25rem',
            fontSize: '0.75rem', fontWeight: 600,
            color: trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : '#64748b',
          }}>
            {trend === 'up' ? <TrendingUp size={14} /> : trend === 'down' ? <TrendingDown size={14} /> : null}
          </div>
        )}
      </div>
      <div>
        <p style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.2 }}>{value}</p>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>{label}</p>
        {subtext && <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>{subtext}</p>}
      </div>
    </div>
  );
}

function MetricRow({ label, value, color }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0.625rem 0', borderBottom: '1px solid var(--color-border)',
    }}>
      <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: color || 'var(--color-text-primary)' }}>{value}</span>
    </div>
  );
}

function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{
      width: '100%', height: 6, borderRadius: 3,
      background: 'var(--color-bg-tertiary)', overflow: 'hidden',
    }}>
      <div style={{
        width: `${pct}%`, height: '100%', borderRadius: 3,
        background: color || 'var(--color-primary-500)',
        transition: 'width 0.6s ease-out',
      }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Staff Reports View
// ═══════════════════════════════════════════════════════
function StaffReportsView({ isMobile }) {
  const { userProfile } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getStaffMetrics(userProfile.uid);
        setMetrics(data);
      } catch (err) {
        console.error('Staff report error:', err);
        setError(err.message);
      }
      setLoading(false);
    }
    load();
  }, [userProfile.uid]);

  if (loading) return <LoadingSpinner text="Loading your report..." />;
  if (error) return (
    <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
      <AlertTriangle size={32} color="var(--color-danger)" />
      <p style={{ marginTop: '0.75rem', color: 'var(--color-text-muted)' }}>Failed to load report: {error}</p>
    </div>
  );
  if (!metrics) return null;

  const { customers, transactions, tasks, charts } = metrics;

  return (
    <>
      {/* ── Top Stats ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: '1rem', marginBottom: '1.5rem',
      }}>
        <ReportStatCard
          icon={Users} label="Assigned Customers" color="#6366f1"
          value={customers.assigned}
          subtext={`${customers.verifiedCount} KYC verified`}
        />
        <ReportStatCard
          icon={DollarSign} label="Revenue Processed" color="#10b981"
          value={formatCurrency(transactions.totalRevenue)}
          subtext={`${transactions.completed} completed`}
        />
        <ReportStatCard
          icon={CheckSquare} label="Task Completion" color="#8b5cf6"
          value={`${tasks.completionRate}%`}
          subtext={`${tasks.completed} of ${tasks.total} tasks`}
        />
        <ReportStatCard
          icon={Clock} label="Pending Actions" color="#f59e0b"
          value={transactions.pending + tasks.pending}
          subtext={`${transactions.pending} TX · ${tasks.pending} tasks`}
        />
      </div>

      {/* ── Middle Row: Transactions + Tasks ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: '1rem', marginBottom: '1.5rem',
      }}>
        {/* Transaction Summary */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={16} color="#10b981" /> My Transactions
          </h3>
          <MetricRow label="Total Processed" value={transactions.total} />
          <MetricRow label="Revenue This Month" value={formatCurrency(transactions.revenueThisMonth)} color="#10b981" />
          <MetricRow label="Pending Revenue" value={formatCurrency(transactions.pendingRevenue)} color="#f59e0b" />
          <MetricRow label="Avg. Transaction Value" value={formatCurrency(transactions.avgTxValue)} />
          <MetricRow label="Success Rate" value={`${transactions.successRate}%`}
            color={transactions.successRate >= 90 ? '#10b981' : '#f59e0b'} />
          <MetricRow label="Failed TX Rate" value={`${transactions.failedTxRate}%`}
            color={transactions.failedTxRate > 5 ? '#ef4444' : '#10b981'} />
        </div>

        {/* Task Summary */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ListChecks size={16} color="#8b5cf6" /> My Tasks
          </h3>
          <MetricRow label="Total Assigned" value={tasks.total} />
          <MetricRow label="Completed" value={tasks.completed} color="#10b981" />
          <MetricRow label="In Progress / Pending" value={tasks.pending} color="#6366f1" />
          <MetricRow label="Overdue" value={tasks.overdue}
            color={tasks.overdue > 0 ? '#ef4444' : '#10b981'} />
          <MetricRow label="Completion Rate" value={`${tasks.completionRate}%`}
            color={tasks.completionRate >= 80 ? '#10b981' : tasks.completionRate >= 50 ? '#f59e0b' : '#ef4444'} />

          {/* Completion Rate Visual */}
          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Progress</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#8b5cf6' }}>{tasks.completionRate}%</span>
            </div>
            <ProgressBar value={tasks.completionRate} max={100} color="#8b5cf6" />
          </div>
        </div>
      </div>

      {/* ── Bottom Row: Customer KYC + TX Distribution ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: '1rem',
      }}>
        {/* Customer Overview */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={16} color="#6366f1" /> Customer Compliance
          </h3>
          <MetricRow label="Assigned to Me" value={customers.assigned} color="#6366f1" />
          <MetricRow label="KYC Verified" value={customers.verifiedCount} color="#10b981" />
          <MetricRow label="KYC Compliance" value={`${customers.kycCompliance}%`}
            color={customers.kycCompliance >= 80 ? '#10b981' : '#f59e0b'} />
          <MetricRow label="New (Last 30 days)" value={customers.newLast30d} color="#8b5cf6" />

          {/* KYC Compliance Visual */}
          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>KYC Rate</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#10b981' }}>{customers.kycCompliance}%</span>
            </div>
            <ProgressBar value={customers.kycCompliance} max={100} color="#10b981" />
          </div>
        </div>

        {/* Transaction Distribution */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={16} color="#6366f1" /> Transaction Distribution
          </h3>
          {Object.entries(charts.txByStatus).map(([status, count]) => {
            const colors = {
              completed: '#10b981', pending: '#f59e0b',
              failed: '#ef4444', cancelled: '#64748b',
            };
            return (
              <div key={status} style={{ marginBottom: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'capitalize', color: 'var(--color-text-secondary)' }}>{status}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: colors[status] || '#64748b' }}>{count}</span>
                </div>
                <ProgressBar value={count} max={transactions.total || 1} color={colors[status]} />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════
// Admin Reports View (existing)
// ═══════════════════════════════════════════════════════
function AdminReportsView({ isMobile }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await generateReport();
        setReport(data);
      } catch (err) {
        console.error('Report error:', err);
        setError(err.message);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <LoadingSpinner text="Generating report..." />;
  if (error) return (
    <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
      <AlertTriangle size={32} color="var(--color-danger)" />
      <p style={{ marginTop: '0.75rem', color: 'var(--color-text-muted)' }}>Failed to load report: {error}</p>
    </div>
  );
  if (!report) return null;

  const { risk, revenue, performance, charts, totals } = report;
  const maxAgentVolume = performance.agentLeaderboard.length > 0
    ? performance.agentLeaderboard[0].volume : 1;

  return (
    <>
      {/* ── Top Stats Row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: '1rem', marginBottom: '1.5rem',
      }}>
        <ReportStatCard
          icon={DollarSign} label="Total Revenue" color="#10b981"
          value={formatCurrency(revenue.totalRevenue)}
          subtext={`${revenue.completedTransactions} completed`}
        />
        <ReportStatCard
          icon={Clock} label="Revenue Pipeline" color="#6366f1"
          value={formatCurrency(revenue.pendingRevenue)}
          subtext={`${revenue.totalTransactions - revenue.completedTransactions} pending`}
        />
        <ReportStatCard
          icon={XCircle} label="Failed TX Rate" color="#ef4444"
          value={`${risk.failedTxRate}%`}
          subtext={`${risk.failedTxCount} failed transactions`}
        />
        <ReportStatCard
          icon={ShieldCheck} label="KYC Compliance" color="#f59e0b"
          value={`${risk.kycComplianceRate}%`}
          subtext={`of ${totals.customers} customers verified`}
        />
      </div>

      {/* ── Middle Row: Revenue + Risk ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: '1rem', marginBottom: '1.5rem',
      }}>
        {/* Revenue Breakdown */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={16} color="#10b981" /> Revenue Breakdown
          </h3>
          <MetricRow label="Total Revenue" value={formatCurrency(revenue.totalRevenue)} color="#10b981" />
          <MetricRow label="This Month" value={formatCurrency(revenue.revenueThisMonth)} color="#6366f1" />
          <MetricRow label="Pipeline (Pending)" value={formatCurrency(revenue.pendingRevenue)} color="#f59e0b" />
          <MetricRow label="Avg. Transaction Value" value={formatCurrency(revenue.avgTxValue)} />
          <MetricRow label="Total Transactions" value={revenue.totalTransactions} />
        </div>

        {/* Risk Summary */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={16} color="#ef4444" /> Risk Summary
          </h3>
          <MetricRow label="Failed TX Rate" value={`${risk.failedTxRate}%`} color={risk.failedTxRate > 5 ? '#ef4444' : '#10b981'} />
          <MetricRow label="Failed Transactions" value={risk.failedTxCount} color="#ef4444" />
          <MetricRow label="Suspended Accounts" value={risk.suspendedCount} color={risk.suspendedCount > 0 ? '#f59e0b' : '#10b981'} />
          <MetricRow label="Stale Leads (90+ days)" value={risk.staleLeadCount} color={risk.staleLeadCount > 0 ? '#f59e0b' : '#10b981'} />
          <MetricRow label="KYC Compliance" value={`${risk.kycComplianceRate}%`} color={risk.kycComplianceRate >= 80 ? '#10b981' : '#f59e0b'} />
        </div>
      </div>

      {/* ── Bottom Row: Agent Leaderboard + Performance ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: '1rem', marginBottom: '1.5rem',
      }}>
        {/* Agent Leaderboard */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Award size={16} color="#fbbf24" /> Agent Leaderboard
          </h3>
          {performance.agentLeaderboard.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>
              No agent data available
            </p>
          ) : (
            performance.agentLeaderboard.map((agent, i) => (
              <div key={i} style={{ marginBottom: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: i === 0 ? 'rgba(251,191,36,0.2)' : 'var(--color-bg-tertiary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.6875rem', fontWeight: 700,
                      color: i === 0 ? '#fbbf24' : 'var(--color-text-muted)',
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{agent.name}</span>
                  </div>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#10b981' }}>
                    {formatCurrency(agent.volume)}
                  </span>
                </div>
                <ProgressBar value={agent.volume} max={maxAgentVolume} color={i === 0 ? '#fbbf24' : '#6366f1'} />
                <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                  {agent.txCount} transactions
                </p>
              </div>
            ))
          )}
        </div>

        {/* Performance Overview */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={16} color="#6366f1" /> Performance Overview
          </h3>
          <MetricRow label="Lead Conversion Rate" value={`${performance.leadConversionRate}%`}
            color={performance.leadConversionRate >= 50 ? '#10b981' : '#f59e0b'} />
          <MetricRow label="New Customers (30d)" value={performance.newCustomers30d} color="#6366f1" />
          <MetricRow label="Total Customers" value={performance.totalCustomers} />
          <MetricRow label="Active Leads" value={performance.totalLeads} />
          <MetricRow label="Active Agents" value={performance.totalAgents} />

          {/* Transaction Distribution */}
          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-muted)', marginTop: '1.25rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Transaction Distribution
          </h4>
          {Object.entries(charts.txByStatus).map(([status, count]) => {
            const colors = {
              completed: '#10b981', pending: '#f59e0b',
              failed: '#ef4444', cancelled: '#64748b',
            };
            return (
              <div key={status} style={{ marginBottom: '0.625rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'capitalize', color: 'var(--color-text-secondary)' }}>{status}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: colors[status] || '#64748b' }}>{count}</span>
                </div>
                <ProgressBar value={count} max={revenue.totalTransactions || 1} color={colors[status]} />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── User Overview Row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: '1rem',
      }}>
        <ReportStatCard icon={Users} label="Total Users" value={totals.users} color="#6366f1" />
        <ReportStatCard icon={Users} label="Customers" value={totals.customers} color="#10b981" />
        <ReportStatCard icon={UserPlus} label="Active Leads" value={totals.leads} color="#f59e0b" />
        <ReportStatCard icon={Users} label="Agents" value={totals.agents} color="#a78bfa" />
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════
// Main ReportsPage — Routes to Admin or Staff view
// ═══════════════════════════════════════════════════════
export default function ReportsPage() {
  usePageTitle('Reports');
  const { isAdmin, userProfile } = useAuth();
  const isMobile = useIsMobile();
  const isStaff = userProfile?.role === 'staff';

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BarChart3 size={isMobile ? 22 : 24} /> {isStaff ? 'My Reports' : 'Reports & Analytics'}
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          {isStaff
            ? 'Your personal performance and assigned data overview'
            : 'Risk, Revenue, and Performance overview'}
        </p>
      </div>

      {/* Role-aware content */}
      {isAdmin ? (
        <AdminReportsView isMobile={isMobile} />
      ) : (
        <StaffReportsView isMobile={isMobile} />
      )}
    </div>
  );
}
