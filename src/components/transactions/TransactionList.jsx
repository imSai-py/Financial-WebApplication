import { useState, useEffect } from 'react';
import { ArrowLeftRight, Plus, ArrowDownLeft, ArrowUpRight, CreditCard, Send } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getTransactions, getTransactionsByCustomer, getTransactionsByAgent } from '../../services/transactionService';
import DataTable from '../shared/DataTable';
import StatusBadge from '../shared/StatusBadge';
import Modal from '../shared/Modal';
import LoadingSpinner from '../shared/LoadingSpinner';
import PaymentForm from '../payments/PaymentForm';
import { formatAmount } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { getAllowedTransactionTypes } from '../../utils/rolePermissions';

/**
 * TransactionList — Phase 6.3 (Enhanced)
 * 
 * Role-aware transaction list with:
 *   - Admin/Staff: Full DataTable with create modal
 *   - Customer: Mobile-friendly card view + payment form
 *   - Agent: DataTable with limited create
 */
export default function TransactionList() {
  const { userProfile, isAdmin, isStaff, isAgent, isCustomer } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [filter, setFilter] = useState('all');
  const [newTx, setNewTx] = useState({ type: 'deposit', amount: '', customerId: '', description: '' });
  const [creating, setCreating] = useState(false);
  const isMobile = useIsMobile();

  async function loadTransactions() {
    try {
      let txs;
      if (isAdmin || isStaff) txs = await getTransactions(userProfile);
      else if (isCustomer) txs = await getTransactionsByCustomer(userProfile.uid);
      else if (isAgent) txs = await getTransactionsByAgent(userProfile.uid);
      else txs = [];
      setTransactions(txs);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  useEffect(() => { loadTransactions(); }, [userProfile.uid, isAdmin, isStaff, isCustomer, isAgent]);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const { createTransaction } = await import('../../services/transactionService');
      const tx = await createTransaction({
        ...newTx,
        amount: parseInt(newTx.amount) || 0,
        staffId: isStaff ? userProfile.uid : '',
        agentId: isAgent ? userProfile.uid : '',
      }, userProfile);
      setTransactions(prev => [tx, ...prev]);
      setShowCreate(false);
      setNewTx({ type: 'deposit', amount: '', customerId: '', description: '' });
    } catch (err) { console.error(err); }
    setCreating(false);
  }

  function handlePaymentSuccess() {
    setShowPayment(false);
    setLoading(true);
    loadTransactions();
  }

  if (loading) return <LoadingSpinner text="Loading transactions..." />;

  const filteredTx = filter === 'all'
    ? transactions
    : transactions.filter(t => t.type === filter);

  // Filter options for customer view
  const typeFilters = isCustomer
    ? ['all', 'deposit', 'withdrawal', 'payment', 'transfer', 'refund']
    : ['all', ...getAllowedTransactionTypes(userProfile?.role)];

  const columns = [
    {
      header: 'Type',
      accessor: 'type',
      render: (row) => (
        <span style={{ textTransform: 'capitalize', fontWeight: 500, fontSize: '0.8125rem' }}>{row.type}</span>
      ),
    },
    {
      header: 'Amount',
      accessor: 'amount',
      render: (row) => (
        <span style={{
          fontWeight: 700, fontSize: '0.875rem',
          color: ['deposit', 'refund'].includes(row.type) ? 'var(--color-success)' : 'var(--color-text-primary)',
        }}>
          {formatAmount(row.amount || 0)}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    { header: 'Description', accessor: 'description' },
    {
      header: 'Date',
      accessor: 'createdAt',
      render: (row) => <span style={{ fontSize: '0.8125rem' }}>{formatDate(row.createdAt)}</span>,
    },
  ];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ArrowLeftRight size={isMobile ? 20 : 24} />
            {isCustomer ? 'My Transactions' : 'Transactions'}
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: isMobile ? '0.8125rem' : '0.875rem' }}>
            {filteredTx.length} {filter !== 'all' ? filter : ''} record{filteredTx.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {isCustomer && (
            <>
              <button className="btn btn-primary" onClick={() => setShowPayment(true)} id="tx-new-payment">
                <CreditCard size={16} /> Pay
              </button>
            </>
          )}
          {(isAdmin || isStaff || isAgent) && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> New Transaction
            </button>
          )}
        </div>
      </div>

      {/* Type Filter Pills */}
      <div style={{
        display: 'flex', gap: '0.375rem', marginBottom: '1rem',
        overflowX: 'auto', paddingBottom: '0.25rem',
        msOverflowStyle: 'none', scrollbarWidth: 'none',
      }}>
        {typeFilters.filter((v, i, a) => a.indexOf(v) === i).map(type => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            style={{
              padding: '0.375rem 0.75rem', borderRadius: 20, border: 'none',
              fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
              textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0,
              background: filter === type ? 'rgba(99,102,241,0.15)' : 'rgba(148,163,184,0.05)',
              color: filter === type ? 'var(--color-primary-400)' : 'var(--color-text-muted)',
              outline: filter === type ? '1px solid var(--color-primary-400)' : '1px solid var(--color-border)',
              transition: 'all 0.2s ease',
            }}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Transaction View — Mobile Cards for Customer, DataTable for others */}
      {isCustomer && isMobile ? (
        <div className="glass-card" style={{ padding: '0.75rem' }}>
          {filteredTx.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>
              No transactions found.
            </p>
          ) : (
            filteredTx.map(tx => {
              const isInflow = ['deposit', 'refund'].includes(tx.type);
              return (
                <div key={tx.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.875rem 0.25rem',
                  borderBottom: '1px solid var(--color-border)',
                  gap: '0.75rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                    <div style={{
                      width: 40, height: 40,
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
                      fontSize: '0.875rem', fontWeight: 700,
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
      ) : (
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <DataTable columns={columns} data={filteredTx} searchPlaceholder="Search transactions..." />
        </div>
      )}

      {/* Admin/Staff Create Transaction Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Transaction">
        <form onSubmit={handleCreate}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Type</label>
            <select className="input" value={newTx.type} onChange={e => setNewTx(p => ({ ...p, type: e.target.value }))}>
              {getAllowedTransactionTypes(userProfile?.role).map(t => (
                <option key={t} value={t} style={{ background: 'var(--color-bg-primary)' }}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Amount (₹)</label>
            <input className="input" type="number" min="0" step="1" required value={newTx.amount} onChange={e => setNewTx(p => ({ ...p, amount: e.target.value }))} placeholder="Enter amount (paise)" />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Customer ID</label>
            <input className="input" value={newTx.customerId} onChange={e => setNewTx(p => ({ ...p, customerId: e.target.value }))} placeholder="Customer UID" />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>Description</label>
            <input className="input" value={newTx.description} onChange={e => setNewTx(p => ({ ...p, description: e.target.value }))} placeholder="Transaction description" />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creating...' : 'Create Transaction'}</button>
          </div>
        </form>
      </Modal>

      {/* Customer Payment Form */}
      <PaymentForm
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
}
