import { useState, useEffect, useCallback } from 'react';
import {
  UserCog, Plus, Edit2, Trash2, ShieldCheck, ShieldOff,
  UserCheck, UserX, Filter, CreditCard
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { getAllUsers, suspendUser, reactivateUser } from '../../services/userService';
import { functions } from '../../config/firebase';
import DataTable from '../shared/DataTable';
import StatusBadge from '../shared/StatusBadge';
import LoadingSpinner from '../shared/LoadingSpinner';
import UserFormModal from './UserFormModal';
import UserDeleteConfirm from './UserDeleteConfirm';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import usePageTitle from '../../hooks/usePageTitle';
import { formatDate } from '../../utils/formatDate';
import { useIsMobile } from '../../hooks/useMediaQuery';

const ROLE_COLORS = {
  admin:    { bg: 'rgba(139,92,246,0.15)',  text: '#a78bfa', border: 'rgba(139,92,246,0.3)' },
  staff:    { bg: 'rgba(59,130,246,0.15)',   text: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
  customer: { bg: 'rgba(16,185,129,0.15)',   text: '#34d399', border: 'rgba(16,185,129,0.3)' },
  agent:    { bg: 'rgba(245,158,11,0.15)',   text: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
};

const KYC_ICONS = {
  verified:      { icon: '✓', color: '#10b981', label: 'Verified' },
  pending:       { icon: '⏳', color: '#f59e0b', label: 'Pending' },
  rejected:      { icon: '✗', color: '#ef4444', label: 'Rejected' },
  not_submitted: { icon: '—', color: '#64748b', label: 'Not Submitted' },
};

const FILTER_TABS = [
  { key: 'all',      label: 'All Users' },
  { key: 'admin',    label: 'Admins' },
  { key: 'staff',    label: 'Staff' },
  { key: 'agent',    label: 'Agents' },
  { key: 'customer', label: 'Customers' },
  { key: 'lead',     label: 'Leads' },
];

export default function UserManagement() {
  usePageTitle('Manage Users');
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const isMobile = useIsMobile();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  // Modal state
  const [formModal, setFormModal] = useState({ open: false, user: null });
  const [deleteModal, setDeleteModal] = useState({ open: false, user: null });
  const [actionLoading, setActionLoading] = useState(null); // uid of user being acted on

  const loadUsers = useCallback(async () => {
    try {
      const data = await getAllUsers();
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
      showToast('Failed to load users', 'error');
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Filter logic
  const filtered = users.filter(u => {
    if (filter === 'all') return true;
    if (filter === 'lead') return u.customerStatus === 'lead';
    return u.role === filter && u.customerStatus !== 'lead';
  });

  // Action handlers
  async function handleSuspendToggle(user) {
    setActionLoading(user.id);
    try {
      if (user.status === 'suspended') {
        await reactivateUser(user.id);
        showToast(`Reactivated ${user.displayName}`, 'success');
      } else {
        await suspendUser(user.id);
        showToast(`Suspended ${user.displayName}`, 'warning');
      }
      await loadUsers();
    } catch (err) {
      showToast(err.message || 'Action failed', 'error');
    }
    setActionLoading(null);
  }

  // Promote lead to active user
  async function handlePromoteLead(user) {
    setActionLoading(user.id);
    try {
      const createUserByAdmin = httpsCallable(functions, 'createUserByAdmin');
      await createUserByAdmin({
        email: user.email,
        displayName: user.displayName,
        role: 'customer',
        phone: user.phone || null,
        existingDocId: user.id, // Tell CF to update existing doc instead of creating new one
      });
      showToast(`Promoted "${user.displayName}" — password reset email sent`, 'success');
      await loadUsers();
    } catch (err) {
      console.error('Promote error:', err);
      showToast(err?.message || 'Failed to promote lead', 'error');
    }
    setActionLoading(null);
  }

  // Role badge renderer
  function RoleBadge({ role }) {
    const colors = ROLE_COLORS[role] || ROLE_COLORS.customer;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
        padding: '0.2rem 0.625rem', borderRadius: 'var(--radius-full)',
        fontSize: '0.6875rem', fontWeight: 600, textTransform: 'capitalize',
        background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`,
      }}>
        {role}
      </span>
    );
  }

  // KYC status renderer
  function KycBadge({ status }) {
    const kyc = KYC_ICONS[status] || KYC_ICONS.not_submitted;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
        fontSize: '0.75rem', color: kyc.color, fontWeight: 500,
      }}>
        {kyc.icon} {kyc.label}
      </span>
    );
  }

  // Pipeline badge
  function PipelineBadge({ user: u }) {
    if (u.customerStatus === 'lead') {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
          padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-full)',
          fontSize: '0.6875rem', fontWeight: 600,
          background: 'rgba(245,158,11,0.15)', color: '#fbbf24',
          border: '1px solid rgba(245,158,11,0.3)',
        }}>
          Lead
        </span>
      );
    }
    if (!u.hasAuthAccount && u.role === 'customer') {
      return <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>No Auth</span>;
    }
    return <span style={{ fontSize: '0.75rem', color: '#10b981' }}>Active</span>;
  }

  const columns = [
    {
      header: 'User',
      accessor: 'displayName',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: `linear-gradient(135deg, ${ROLE_COLORS[row.role]?.text || '#6366f1'}40, ${ROLE_COLORS[row.role]?.text || '#6366f1'}20)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 700,
            color: ROLE_COLORS[row.role]?.text || '#6366f1',
            flexShrink: 0,
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
      header: 'Role',
      accessor: 'role',
      render: (row) => <RoleBadge role={row.role} />,
    },
    {
      header: 'Pipeline',
      accessor: 'customerStatus',
      render: (row) => <PipelineBadge user={row} />,
      hideOnMobile: true,
    },
    {
      header: 'KYC',
      accessor: 'kycStatus',
      render: (row) => <KycBadge status={row.kycStatus} />,
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
      render: (row) => {
        const isCurrentUser = row.id === userProfile?.uid;
        const isLead = row.customerStatus === 'lead';
        const isLoadingThis = actionLoading === row.id;

        return (
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            {/* Edit */}
            <button
              className="btn btn-ghost btn-sm"
              onClick={(e) => { e.stopPropagation(); setFormModal({ open: true, user: row }); }}
              title="Edit"
              style={{ padding: '0.375rem' }}
            >
              <Edit2 size={14} />
            </button>

            {/* Promote Lead */}
            {isLead && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={(e) => { e.stopPropagation(); handlePromoteLead(row); }}
                title="Promote to Active User"
                disabled={isLoadingThis}
                style={{ padding: '0.375rem', color: '#10b981' }}
              >
                <UserCheck size={14} />
              </button>
            )}

            {/* Suspend / Reactivate */}
            {!isCurrentUser && !isLead && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={(e) => { e.stopPropagation(); handleSuspendToggle(row); }}
                title={row.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                disabled={isLoadingThis}
                style={{
                  padding: '0.375rem',
                  color: row.status === 'suspended' ? '#10b981' : '#f59e0b',
                }}
              >
                {row.status === 'suspended' ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
              </button>
            )}

            {/* Delete */}
            {!isCurrentUser && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={(e) => { e.stopPropagation(); setDeleteModal({ open: true, user: row }); }}
                title="Delete"
                style={{ padding: '0.375rem', color: 'var(--color-danger)' }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  if (loading) return <LoadingSpinner text="Loading users..." />;

  const leadCount = users.filter(u => u.customerStatus === 'lead').length;
  const activeCount = users.filter(u => u.status === 'active' && u.customerStatus !== 'lead').length;
  const suspendedCount = users.filter(u => u.status === 'suspended').length;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between', marginBottom: '1.25rem',
        flexDirection: isMobile ? 'column' : 'row', gap: '0.75rem',
      }}>
        <div>
          <h1 style={{
            fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 800,
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <UserCog size={isMobile ? 22 : 24} /> Manage Users
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            {users.length} total · {activeCount} active · {leadCount} leads · {suspendedCount} suspended
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setFormModal({ open: true, user: null })}
          style={{ minHeight: isMobile ? 44 : undefined }}
        >
          <Plus size={16} /> New User
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{
        display: 'flex', gap: '0.25rem', marginBottom: '1rem',
        overflowX: 'auto', paddingBottom: '0.25rem',
        WebkitOverflowScrolling: 'touch',
      }}>
        {FILTER_TABS.map(tab => {
          const count = tab.key === 'all'
            ? users.length
            : tab.key === 'lead'
              ? users.filter(u => u.customerStatus === 'lead').length
              : users.filter(u => u.role === tab.key && u.customerStatus !== 'lead').length;
          return (
            <button
              key={tab.key}
              className={`btn btn-sm ${filter === tab.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(tab.key)}
              style={{
                whiteSpace: 'nowrap', fontSize: '0.8125rem',
                minHeight: isMobile ? 40 : undefined,
              }}
            >
              {tab.label}
              <span style={{
                marginLeft: '0.375rem', fontSize: '0.6875rem',
                opacity: 0.7,
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Data Table */}
      <div className="glass-card" style={{ padding: isMobile ? '0.75rem' : '1.25rem' }}>
        <DataTable
          columns={columns}
          data={filtered}
          searchPlaceholder="Search users by name, email, role..."
          emptyMessage={filter === 'lead' ? 'No leads found' : 'No users found'}
        />
      </div>

      {/* Modals */}
      <UserFormModal
        isOpen={formModal.open}
        onClose={() => setFormModal({ open: false, user: null })}
        user={formModal.user}
        onSuccess={loadUsers}
      />
      <UserDeleteConfirm
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, user: null })}
        user={deleteModal.user}
        onSuccess={loadUsers}
      />
    </div>
  );
}
