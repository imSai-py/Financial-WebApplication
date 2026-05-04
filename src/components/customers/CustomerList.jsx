import { useState, useEffect, useCallback } from 'react';
import { Users as UsersIcon, Plus, Eye, Edit2, ShieldCheck } from 'lucide-react';
import { getAllUsers, getUsersByRole, getCustomersByStaff, updateUser } from '../../services/userService';
import DataTable from '../shared/DataTable';
import StatusBadge from '../shared/StatusBadge';
import LoadingSpinner from '../shared/LoadingSpinner';
import Modal from '../shared/Modal';
import UserFormModal from '../users/UserFormModal';
import { formatDate } from '../../utils/formatDate';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useIsMobile } from '../../hooks/useMediaQuery';

const KYC_COLORS = {
  verified:      { bg: 'rgba(16,185,129,0.15)', text: '#10b981' },
  pending:       { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
  rejected:      { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444' },
  not_submitted: { bg: 'rgba(100,116,139,0.15)', text: '#64748b' },
};

const FILTER_TABS = [
  { key: 'all',         label: 'All' },
  { key: 'lead',        label: 'Leads' },
  { key: 'kyc_pending', label: 'KYC Pending' },
  { key: 'verified',    label: 'Verified' },
  { key: 'active',      label: 'Active' },
];

export default function CustomerList() {
  const { isAdmin, userProfile } = useAuth();
  const { showToast } = useToast();
  const isMobile = useIsMobile();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewCustomer, setViewCustomer] = useState(null);
  const [editModal, setEditModal] = useState({ open: false, user: null });
  const [createModal, setCreateModal] = useState(false);
  const [filter, setFilter] = useState('all');

  const isStaff = userProfile?.role === 'staff';

  const load = useCallback(async () => {
    try {
      // Role-aware data source: Admin sees all, Staff sees only assigned
      const users = isAdmin
        ? await getUsersByRole('customer')
        : await getCustomersByStaff(userProfile.uid);
      setCustomers(users);
    } catch (err) {
      console.error('Error loading customers:', err);
    }
    setLoading(false);
  }, [isAdmin, userProfile.uid]);

  useEffect(() => { load(); }, [load]);

  // Filter logic
  const filtered = customers.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'lead') return c.customerStatus === 'lead';
    if (filter === 'kyc_pending') return c.kycStatus === 'pending' || c.kycStatus === 'not_submitted';
    if (filter === 'verified') return c.kycStatus === 'verified';
    if (filter === 'active') return c.customerStatus === 'active' || (!c.customerStatus && c.status === 'active');
    return true;
  });

  function KycBadge({ status }) {
    const colors = KYC_COLORS[status] || KYC_COLORS.not_submitted;
    const label = (status || 'not_submitted').replace(/_/g, ' ');
    return (
      <span style={{
        display: 'inline-flex', padding: '0.2rem 0.5rem',
        borderRadius: 'var(--radius-full)', fontSize: '0.6875rem',
        fontWeight: 600, textTransform: 'capitalize',
        background: colors.bg, color: colors.text,
      }}>
        {label}
      </span>
    );
  }

  function PipelineBadge({ customer }) {
    if (customer.customerStatus === 'lead') {
      return (
        <span style={{
          padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-full)',
          fontSize: '0.6875rem', fontWeight: 600,
          background: 'rgba(245,158,11,0.15)', color: '#fbbf24',
        }}>
          Lead
        </span>
      );
    }
    return <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 500 }}>Active</span>;
  }

  if (loading) return <LoadingSpinner text="Loading customers..." />;

  const columns = [
    {
      header: 'Customer',
      accessor: 'displayName',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(16,185,129,0.4), rgba(16,185,129,0.2))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 700, color: '#34d399', flexShrink: 0,
          }}>
            {row.displayName?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <p style={{ fontWeight: 500, fontSize: '0.8125rem' }}>{row.displayName || 'Unnamed'}</p>
            <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Pipeline',
      accessor: 'customerStatus',
      render: (row) => <PipelineBadge customer={row} />,
      hideOnMobile: true,
    },
    {
      header: 'KYC',
      accessor: 'kycStatus',
      render: (row) => <KycBadge status={row.kycStatus} />,
    },
    {
      header: 'Phone',
      accessor: 'phone',
      render: (row) => <span style={{ fontSize: '0.8125rem' }}>{row.phone || '—'}</span>,
      hideOnMobile: true,
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Joined',
      accessor: 'createdAt',
      render: (row) => <span style={{ fontSize: '0.8125rem' }}>{formatDate(row.createdAt)}</span>,
      hideOnMobile: true,
    },
    {
      header: 'Actions',
      render: (row) => (
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setViewCustomer(row)} title="View" style={{ padding: '0.375rem' }}>
            <Eye size={14} />
          </button>
          {isAdmin && (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditModal({ open: true, user: row })} title="Edit" style={{ padding: '0.375rem' }}>
              <Edit2 size={14} />
            </button>
          )}
        </div>
      ),
    },
  ];

  const leadCount = customers.filter(c => c.customerStatus === 'lead').length;
  const verifiedCount = customers.filter(c => c.kycStatus === 'verified').length;

  return (
    <div className="animate-fade-in">
      <div style={{
        display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between', marginBottom: '1.25rem',
        flexDirection: isMobile ? 'column' : 'row', gap: '0.75rem',
      }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UsersIcon size={isMobile ? 22 : 24} /> Customers
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            {customers.length} total · {leadCount} leads · {verifiedCount} KYC verified
          </p>
        </div>
        {(isAdmin || isStaff) && (
          <button className="btn btn-primary" onClick={() => setCreateModal(true)} style={{ minHeight: isMobile ? 44 : undefined }}>
            <Plus size={16} /> Add Customer
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div style={{
        display: 'flex', gap: '0.25rem', marginBottom: '1rem',
        overflowX: 'auto', paddingBottom: '0.25rem',
      }}>
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            className={`btn btn-sm ${filter === tab.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(tab.key)}
            style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="glass-card" style={{ padding: isMobile ? '0.75rem' : '1.25rem' }}>
        <DataTable columns={columns} data={filtered} searchPlaceholder="Search customers..." emptyMessage="No customers found" />
      </div>

      {/* View Detail Modal */}
      <Modal isOpen={!!viewCustomer} onClose={() => setViewCustomer(null)} title="Customer Details">
        {viewCustomer && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(16,185,129,0.4), rgba(16,185,129,0.2))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.25rem', fontWeight: 700, color: '#34d399',
              }}>
                {viewCustomer.displayName?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>{viewCustomer.displayName}</h3>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>{viewCustomer.email}</p>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.375rem' }}>
                  <PipelineBadge customer={viewCustomer} />
                  <KycBadge status={viewCustomer.kycStatus} />
                </div>
              </div>
            </div>

            {/* Details Grid */}
            {[
              ['Phone', viewCustomer.phone],
              ['Status', viewCustomer.status],
              ['PAN Number', viewCustomer.panNumber],
              ['Aadhaar (Last 4)', viewCustomer.aadhaarLastFour],
              ['Date of Birth', viewCustomer.dateOfBirth],
              ['KYC Status', viewCustomer.kycStatus?.replace(/_/g, ' ')],
              ['Address', [viewCustomer.address?.street, viewCustomer.address?.city, viewCustomer.address?.state, viewCustomer.address?.zip].filter(Boolean).join(', ')],
              ['Joined', formatDate(viewCustomer.createdAt)],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>{label}</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 500, textTransform: 'capitalize' }}>{value || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Edit Modal (reuses UserFormModal) */}
      <UserFormModal
        isOpen={editModal.open}
        onClose={() => setEditModal({ open: false, user: null })}
        user={editModal.user}
        onSuccess={load}
      />

      {/* Create Lead Modal */}
      <UserFormModal
        isOpen={createModal}
        onClose={() => setCreateModal(false)}
        user={null}
        onSuccess={load}
        allowedRoles={isStaff ? ['customer'] : undefined}
        title={isStaff ? 'Create Customer' : undefined}
      />
    </div>
  );
}
