import { useState, useEffect } from 'react';
import { IndianRupee } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getCommissions, getCommissionsByAgent, summarizeReferralEarnings } from '../../services/commissionService';
import DataTable from '../shared/DataTable';
import StatusBadge from '../shared/StatusBadge';
import LoadingSpinner from '../shared/LoadingSpinner';
import { formatAmount } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import StatCard from '../shared/StatCard';

export default function CommissionList() {
  const { userProfile, isAdmin } = useAuth();
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = isAdmin ? await getCommissions(userProfile) : await getCommissionsByAgent(userProfile.uid);
        setCommissions(data);
      } catch (err) { console.error(err); }
      setLoading(false);
    }
    load();
  }, [userProfile.uid, isAdmin]);

  if (loading) return <LoadingSpinner text="Loading commissions..." />;

  const totalPaid = commissions.filter(c => c.status === 'paid').reduce((s, c) => s + (c.amount || 0), 0);
  const totalPending = commissions.filter(c => c.status === 'pending').reduce((s, c) => s + (c.amount || 0), 0);
  const referralSummary = summarizeReferralEarnings(
    commissions.filter((commission) => commission.type === 'customer_referral_commission')
  );

  const columns = [
    {
      header: 'Type',
      accessor: 'type',
      render: (row) => (
        <span style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}>
          {(row.type || 'manual').replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      header: 'Rate',
      accessor: 'rate',
      render: (row) => <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{row.rate}%</span>,
    },
    {
      header: 'Amount',
      accessor: 'amount',
      render: (row) => <span style={{ fontWeight: 700, color: 'var(--color-success)', fontSize: '0.875rem' }}>{formatAmount(row.amount || 0)}</span>,
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Source',
      accessor: 'transactionId',
      render: (row) => (
        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
          {row.transactionId
            ? row.transactionId.slice(0, 12)
            : row.sourceCustomerId
              ? row.sourceCustomerId.slice(0, 12)
              : 'â€”'}
        </span>
      ),
    },
    isAdmin ? {
      header: 'Level',
      accessor: 'level',
      render: (row) => <span style={{ fontSize: '0.8125rem' }}>{row.level || 'â€”'}</span>,
    } : null,
    isAdmin ? {
      header: 'Beneficiary',
      accessor: 'beneficiaryId',
      render: (row) => (
        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
          {row.beneficiaryId || row.agentId || 'â€”'}
        </span>
      ),
    } : null,
    {
      header: 'Date',
      accessor: 'createdAt',
      render: (row) => <span style={{ fontSize: '0.8125rem' }}>{formatDate(row.createdAt)}</span>,
    },
  ].filter(Boolean);

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <IndianRupee size={24} /> Commissions
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{commissions.length} total records</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard title="Total Paid" value={formatAmount(totalPaid)} icon={IndianRupee} color="success" />
        <StatCard title="Pending Payout" value={formatAmount(totalPending)} icon={IndianRupee} color="warning" />
        {isAdmin && <StatCard title="Referral Earnings" value={formatAmount(referralSummary.total)} icon={IndianRupee} color="info" />}
        <StatCard title="Total Records" value={commissions.length} icon={IndianRupee} color="primary" />
      </div>

      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <DataTable columns={columns} data={commissions} searchPlaceholder="Search commissions..." />
      </div>
    </div>
  );
}
