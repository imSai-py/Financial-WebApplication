import { useEffect, useMemo, useState } from 'react';
import {
  Banknote, CheckCircle, CreditCard, FileText, Landmark,
  Plus, RefreshCw, Send, ShieldCheck, TrendingUp, XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { formatAmount } from '../../utils/formatCurrency';
import { formatDate, formatDateTime } from '../../utils/formatDate';
import { validators } from '../../utils/validation';
import DataTable from '../shared/DataTable';
import Modal from '../shared/Modal';
import {
  approveInvestmentPayout,
  createInvestmentForCustomer,
  createInvestmentPlan,
  createOfficeCollection,
  getFundingRequests,
  getInvestmentPayouts,
  getInvestmentPlans,
  getInvestments,
  recordInvestmentPayout,
  submitInvestmentFundingRequest,
  uploadFundingReceipt,
  verifyInvestmentFundingRequest,
} from '../../services/investmentService';
import { getAllUsers } from '../../services/userService';

const PAYMENT_METHODS = ['UPI', 'Bank Transfer', 'Cash', 'Office Collection'];

function statusColor(status) {
  if (['approved', 'paid', 'active', 'fully_funded', 'closed'].includes(status)) return '#10b981';
  if (['rejected', 'overdue'].includes(status)) return '#ef4444';
  return '#f59e0b';
}

function InfoCard({ icon: IconComponent, label, value, accent = '#6366f1' }) {
  const renderedIcon = <IconComponent size={16} style={{ color: accent }} />;
  return (
    <div className="glass-card" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        {renderedIcon}
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{label}</span>
      </div>
      <p style={{ fontSize: '1.1rem', fontWeight: 800 }}>{value}</p>
    </div>
  );
}

function FundingStatus({ status }) {
  return (
    <span style={{
      color: statusColor(status),
      background: `${statusColor(status)}1a`,
      border: `1px solid ${statusColor(status)}33`,
      borderRadius: 999,
      padding: '0.25rem 0.6rem',
      fontSize: '0.72rem',
      fontWeight: 700,
      textTransform: 'capitalize',
      whiteSpace: 'nowrap',
    }}>
      {(status || 'pending').replace(/_/g, ' ')}
    </span>
  );
}

export default function InvestmentHub() {
  const { userProfile } = useAuth();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [requests, setRequests] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [users, setUsers] = useState([]);
  const [fundingModal, setFundingModal] = useState({ open: false, investment: null });
  const [planModal, setPlanModal] = useState(false);
  const [assignModal, setAssignModal] = useState(false);
  const [officeModal, setOfficeModal] = useState(false);
  const [payoutModal, setPayoutModal] = useState({ open: false, payout: null, mode: 'record' });
  const isVerifier = ['admin', 'staff'].includes(userProfile?.role);
  const isAdmin = userProfile?.role === 'admin';
  const isCustomer = userProfile?.role === 'customer';

  async function loadData() {
    setLoading(true);
    try {
      const [planData, investmentData, requestData, payoutData, userData] = await Promise.all([
        getInvestmentPlans({ includeInactive: isAdmin }),
        getInvestments(userProfile),
        getFundingRequests(userProfile),
        getInvestmentPayouts(userProfile),
        isVerifier || userProfile?.role === 'agent' ? getAllUsers() : Promise.resolve([]),
      ]);
      setPlans(planData);
      setInvestments(investmentData);
      setRequests(requestData);
      setPayouts(payoutData);
      setUsers(userData);
    } catch (err) {
      console.error('Investment load failed:', err);
      showToast(err.message || 'Failed to load investment data', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (userProfile?.uid) loadData();
  }, [userProfile?.uid]);

  const totals = useMemo(() => {
    const required = investments.reduce((sum, item) => sum + (item.requiredAmount || item.planSnapshot?.requiredAmount || 0), 0);
    const funded = investments.reduce((sum, item) => sum + (item.fundedAmount || 0), 0);
    const returns = payouts.filter((item) => item.status === 'paid').reduce((sum, item) => sum + (item.amount || 0), 0);
    return { required, funded, returns };
  }, [investments, payouts]);

  async function handleVerify(request, action) {
    const remarks = action === 'reject'
      ? window.prompt('Enter rejection reason')
      : window.prompt('Remarks (optional)') || '';
    if (action === 'reject' && !remarks) return;
    try {
      await verifyInvestmentFundingRequest({ fundingRequestId: request.id, action, remarks });
      showToast(action === 'approve' ? 'Funding approved' : 'Funding rejected', 'success');
      await loadData();
    } catch (err) {
      showToast(err.message || 'Verification failed', 'error');
    }
  }

  if (loading) {
    return <div className="glass-card" style={{ padding: '2rem' }}>Loading investment workspace...</div>;
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: '1rem', flexDirection: isMobile ? 'column' : 'row', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={24} /> Investments
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            Funding verification, payout tracking, and investor portfolio status.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={loadData}><RefreshCw size={16} /> Refresh</button>
          {isAdmin && <button className="btn btn-primary" onClick={() => setPlanModal(true)}><Plus size={16} /> New Plan</button>}
          {isVerifier && <button className="btn btn-primary" onClick={() => setAssignModal(true)}><Plus size={16} /> Assign Investment</button>}
          {isVerifier && <button className="btn btn-secondary" onClick={() => setOfficeModal(true)}><Banknote size={16} /> Office Collection</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
        <InfoCard icon={Landmark} label="Investments" value={investments.length} />
        <InfoCard icon={CreditCard} label="Required" value={formatAmount(totals.required)} accent="#f59e0b" />
        <InfoCard icon={ShieldCheck} label="Funded" value={formatAmount(totals.funded)} accent="#10b981" />
        <InfoCard icon={Banknote} label="Returns Paid" value={formatAmount(totals.returns)} accent="#ec4899" />
      </div>

      {isCustomer && (
        <CustomerFundingPanel
          userProfile={userProfile}
          settings={settings}
          investments={investments}
          requests={requests}
          payouts={payouts}
          onFund={(investment) => setFundingModal({ open: true, investment })}
        />
      )}

      {isVerifier && (
        <VerifierPanel
          requests={requests}
          investments={investments}
          payouts={payouts}
          role={userProfile?.role}
          onVerify={handleVerify}
          onPayout={(payout, mode) => setPayoutModal({ open: true, payout, mode })}
        />
      )}

      {isVerifier && <ReferralAnalyticsPanel users={users} />}

      <InvestmentPortfolioTable investments={investments} />

      <FundingRequestModal
        state={fundingModal}
        onClose={() => setFundingModal({ open: false, investment: null })}
        userProfile={userProfile}
        settings={settings}
        onDone={loadData}
      />
      <PlanModal isOpen={planModal} onClose={() => setPlanModal(false)} onDone={loadData} />
      <AssignInvestmentModal isOpen={assignModal} onClose={() => setAssignModal(false)} onDone={loadData} plans={plans} users={users} />
      <OfficeCollectionModal isOpen={officeModal} onClose={() => setOfficeModal(false)} onDone={loadData} investments={investments} />
      <PayoutActionModal state={payoutModal} onClose={() => setPayoutModal({ open: false, payout: null, mode: 'record' })} onDone={loadData} />
    </div>
  );
}

function ReferralAnalyticsPanel({ users }) {
  const customers = users.filter((item) => item.role === 'customer');
  const referralRows = customers
    .filter((customer) => customer.referrerId || customer.referrerCustomerId)
    .map((customer) => ({
      ...customer,
      referrerName: customer.referredByName || customer.referralPath?.[0]?.name || customer.referrerId || '-',
      referralDepthLabel: customer.referralDepth || customer.referralLevel || 0,
    }));
  const topReferrers = customers
    .filter((customer) => (customer.directReferralCount || customer.totalReferralCount || 0) > 0)
    .sort((a, b) => (b.totalReferralCount || b.directReferralCount || 0) - (a.totalReferralCount || a.directReferralCount || 0))
    .slice(0, 10);

  return (
    <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem' }}>Referral Management</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <InfoCard icon={TrendingUp} label="Referred Customers" value={referralRows.length} accent="#10b981" />
        <InfoCard icon={Landmark} label="Top Referrers" value={topReferrers.length} accent="#f59e0b" />
        <InfoCard icon={Banknote} label="Referral Earnings" value={formatAmount(customers.reduce((sum, item) => sum + (item.referralEarnings || 0), 0))} accent="#ec4899" />
      </div>
      <DataTable
        data={referralRows}
        columns={[
          { header: 'Customer', accessor: 'displayName' },
          { header: 'Customer ID', accessor: 'customerId' },
          { header: 'Referrer', accessor: 'referrerName' },
          { header: 'Depth', accessor: 'referralDepthLabel' },
          { header: 'Direct Referrals', accessor: 'directReferralCount' },
          { header: 'Total Referrals', accessor: 'totalReferralCount' },
          { header: 'Earnings', accessor: 'referralEarnings', render: (row) => formatAmount(row.referralEarnings || 0) },
        ]}
        exportable
        exportFormats={['csv', 'xlsx']}
        exportFilename="referral-report"
        emptyMessage="No referral records found."
      />
    </div>
  );
}

function CustomerFundingPanel({ userProfile, settings, investments, requests, payouts, onFund }) {
  function exportStatement() {
    const rows = requests.map((request) => `
      <tr>
        <td>${formatDate(request.createdAt)}</td>
        <td>${formatAmount(request.submittedAmount || 0)}</td>
        <td>${request.paymentMethod || ''}</td>
        <td>${request.transactionReference || ''}</td>
        <td>${request.status || ''}</td>
      </tr>
    `).join('');
    const payoutRows = payouts.map((payout) => `
      <tr>
        <td>${payout.monthNumber || ''}</td>
        <td>${formatDate(payout.expectedDate)}</td>
        <td>${payout.actualPaidDate ? formatDate(payout.actualPaidDate) : '-'}</td>
        <td>${formatAmount(payout.amount || 0)}</td>
        <td>${payout.status || ''}</td>
      </tr>
    `).join('');
    const html = `
      <html>
        <head>
          <title>Customer Statement</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { font-size: 22px; margin-bottom: 4px; }
            h2 { font-size: 16px; margin-top: 24px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
            th { background: #f3f4f6; }
            .meta { color: #4b5563; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>${userProfile?.displayName || 'Customer'} Statement</h1>
          <p class="meta">Customer ID: ${userProfile?.customerId || userProfile?.username || ''}</p>
          <p class="meta">Generated: ${new Date().toLocaleString('en-IN')}</p>
          <h2>Customer Information</h2>
          <p>Email: ${userProfile?.email || '-'}</p>
          <p>Phone: ${userProfile?.phone || '-'}</p>
          <p>Referrer: ${userProfile?.referredByName || 'None'}</p>
          <h2>Investment Summary</h2>
          <p>Active Investments: ${investments.filter((item) => item.lifecycleStatus === 'active').length}</p>
          <p>Total Funded: ${formatAmount(investments.reduce((sum, item) => sum + (item.fundedAmount || 0), 0))}</p>
          <p>Total Returns Paid: ${formatAmount(payouts.filter((item) => item.status === 'paid').reduce((sum, item) => sum + (item.amount || 0), 0))}</p>
          <h2>Funding History</h2>
          <table><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>UTR</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No funding records</td></tr>'}</tbody></table>
          <h2>Payout History</h2>
          <table><thead><tr><th>Month</th><th>Expected</th><th>Actual</th><th>Amount</th><th>Status</th></tr></thead><tbody>${payoutRows || '<tr><td colspan="5">No payout records</td></tr>'}</tbody></table>
        </body>
      </html>
    `;
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <>
      <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Landmark size={18} /> Customer Profile
          </h3>
          <button className="btn btn-secondary btn-sm" onClick={exportStatement}><FileText size={14} /> Statement PDF</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <Detail label="Customer ID" value={userProfile?.customerId || userProfile?.username || '-'} />
          <Detail label="Name" value={userProfile?.displayName || '-'} />
          <Detail label="Contact" value={userProfile?.phone || userProfile?.email || '-'} />
          <Detail label="My Referrer" value={userProfile?.referredByName || 'None'} />
          <Detail label="Total Referrals" value={userProfile?.totalReferralCount || 0} />
          <Detail label="Referral Earnings" value={formatAmount(userProfile?.referralEarnings || 0)} />
        </div>
      </div>

      <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <CreditCard size={18} /> Payment Details
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          {settings?.paymentQrCodeUrl && <img src={settings.paymentQrCodeUrl} alt="Payment QR code" style={{ width: 150, maxWidth: '100%', borderRadius: 8, border: '1px solid var(--color-border)' }} />}
          <Detail label="UPI ID" value={settings?.paymentUpiId || 'Not configured'} />
          <Detail label="Account Holder" value={settings?.paymentAccountHolderName || 'Not configured'} />
          <Detail label="Bank Account" value={settings?.paymentBankAccountNumber || 'Not configured'} />
          <Detail label="IFSC" value={settings?.paymentIfscCode || 'Not configured'} />
        </div>
      </div>

      <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem' }}>Funding History</h3>
        <DataTable
          data={requests}
          columns={[
            { header: 'Date', accessor: 'createdAt', render: (row) => formatDate(row.createdAt) },
            { header: 'Amount', accessor: 'submittedAmount', render: (row) => formatAmount(row.submittedAmount || 0) },
            { header: 'Method', accessor: 'paymentMethod' },
            { header: 'UTR', accessor: 'transactionReference' },
            { header: 'Status', accessor: 'status', render: (row) => <FundingStatus status={row.status} /> },
          ]}
          exportable
          exportFormats={['csv', 'xlsx']}
          exportFilename="funding-history"
          emptyMessage="No funding requests yet."
        />
      </div>

      <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem' }}>Payout Schedule</h3>
        <DataTable
          data={payouts}
          columns={[
            { header: 'Month', accessor: 'monthNumber' },
            { header: 'Expected Date', accessor: 'expectedDate', render: (row) => formatDate(row.expectedDate) },
            { header: 'Actual Paid Date', accessor: 'actualPaidDate', render: (row) => row.actualPaidDate ? formatDate(row.actualPaidDate) : '-' },
            { header: 'Amount', accessor: 'amount', render: (row) => formatAmount(row.amount || 0) },
            { header: 'Status', accessor: 'status', render: (row) => <FundingStatus status={row.status} /> },
          ]}
          emptyMessage="Payouts appear after an investment becomes active."
        />
      </div>

      <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem' }}>My Investments</h3>
        <DataTable
          data={investments}
          columns={[
            { header: 'Plan', accessor: 'planName', render: (row) => row.planSnapshot?.planName || '-' },
            { header: 'Funded', accessor: 'fundedAmount', render: (row) => `${formatAmount(row.fundedAmount || 0)} / ${formatAmount(row.requiredAmount || 0)}` },
            { header: 'Funding', accessor: 'fundingStatus', render: (row) => <FundingStatus status={row.fundingStatus} /> },
            { header: 'Lifecycle', accessor: 'lifecycleStatus', render: (row) => <FundingStatus status={row.lifecycleStatus} /> },
          ]}
          rowActions={(row) => row.lifecycleStatus === 'pending_activation' && (
            <button className="btn btn-primary btn-sm" onClick={() => onFund(row)}><Send size={14} /> Submit Proof</button>
          )}
          emptyMessage="No investments assigned yet."
        />
      </div>
    </>
  );
}

function VerifierPanel({ requests, payouts, role, onVerify, onPayout }) {
  const pendingRequests = requests.filter((item) => item.status === 'pending');
  const pendingPayouts = payouts.filter((item) => ['pending', 'scheduled', 'overdue'].includes(item.status));
  return (
    <>
      <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem' }}>Funding Verification Queue</h3>
        <DataTable
          data={pendingRequests}
          columns={[
            { header: 'Customer', accessor: 'customerName' },
            { header: 'Plan', accessor: 'planName' },
            { header: 'Amount', accessor: 'submittedAmount', render: (row) => formatAmount(row.submittedAmount || 0) },
            { header: 'UTR', accessor: 'transactionReference' },
            { header: 'Method', accessor: 'paymentMethod' },
            { header: 'Submitted', accessor: 'createdAt', render: (row) => formatDateTime(row.createdAt) },
            { header: 'Status', accessor: 'status', render: (row) => <FundingStatus status={row.status} /> },
          ]}
          rowActions={(row) => (
            <>
              {row.receipt?.url && <a className="btn btn-ghost btn-sm" href={row.receipt.url} target="_blank" rel="noreferrer"><FileText size={14} /></a>}
              <button className="btn btn-primary btn-sm" onClick={() => onVerify(row, 'approve')}><CheckCircle size={14} /></button>
              <button className="btn btn-ghost btn-sm" onClick={() => onVerify(row, 'reject')} style={{ color: 'var(--color-danger)' }}><XCircle size={14} /></button>
            </>
          )}
          emptyMessage="No pending funding requests."
        />
      </div>

      <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem' }}>Payout Approval Queue</h3>
        <DataTable
          data={pendingPayouts}
          columns={[
            { header: 'Customer', accessor: 'customerId' },
            { header: 'Month', accessor: 'monthNumber' },
            { header: 'Expected Date', accessor: 'expectedDate', render: (row) => formatDate(row.expectedDate) },
            { header: 'Amount', accessor: 'amount', render: (row) => formatAmount(row.amount || 0) },
            { header: 'Status', accessor: 'status', render: (row) => <FundingStatus status={row.status} /> },
          ]}
          rowActions={(row) => (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => onPayout(row, role === 'admin' ? 'approve' : 'record')}
            >
              <ShieldCheck size={14} /> {role === 'admin' ? 'Approve' : 'Record'}
            </button>
          )}
          emptyMessage="No payout approvals pending."
        />
      </div>
    </>
  );
}

function InvestmentPortfolioTable({ investments }) {
  return (
    <div className="glass-card" style={{ padding: '1.25rem' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem' }}>Investor Portfolio</h3>
      <DataTable
        data={investments}
        columns={[
          { header: 'Customer', accessor: 'customerName' },
          { header: 'Customer ID', accessor: 'customerCode' },
          { header: 'Plan', accessor: 'planName', render: (row) => row.planSnapshot?.planName || '-' },
          { header: 'Required', accessor: 'requiredAmount', render: (row) => formatAmount(row.requiredAmount || 0) },
          { header: 'Funded', accessor: 'fundedAmount', render: (row) => formatAmount(row.fundedAmount || 0) },
          { header: 'Funding', accessor: 'fundingStatus', render: (row) => <FundingStatus status={row.fundingStatus} /> },
          { header: 'Lifecycle', accessor: 'lifecycleStatus', render: (row) => <FundingStatus status={row.lifecycleStatus} /> },
        ]}
        exportable
        exportFormats={['csv', 'xlsx']}
        exportFilename="investment-portfolio"
        emptyMessage="No investments found."
      />
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>{label}</p>
      <p style={{ fontWeight: 700 }}>{value}</p>
    </div>
  );
}

function FundingRequestModal({ state, onClose, userProfile, settings, onDone }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ amount: '', paymentMethod: 'UPI', transactionReference: '', paymentDate: '', receipt: null });
  const [saving, setSaving] = useState(false);
  const investment = state.investment;

  async function handleSubmit(e) {
    e.preventDefault();
    const amountError = validators.amount(form.amount);
    if (amountError) return showToast(amountError, 'error');
    if (!form.transactionReference.trim() && !['Cash', 'Office Collection'].includes(form.paymentMethod)) {
      return showToast('UTR or transaction reference is required', 'error');
    }
    setSaving(true);
    try {
      const receipt = form.receipt ? await uploadFundingReceipt({ userId: userProfile.uid, file: form.receipt }) : null;
      await submitInvestmentFundingRequest({
        investmentId: investment.id,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        transactionReference: form.transactionReference,
        paymentDate: form.paymentDate,
        receipt,
      });
      showToast('Funding request submitted', 'success');
      onClose();
      await onDone();
    } catch (err) {
      showToast(err.message || 'Failed to submit funding request', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={state.open} onClose={onClose} title="Submit Payment Proof" maxWidth={560}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <Detail label="Remaining Amount" value={formatAmount(investment?.remainingFundingAmount || 0)} />
        </div>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <input className="input" type="number" placeholder="Payment amount" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} />
          <select className="input" value={form.paymentMethod} onChange={(e) => setForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}>
            {(settings?.supportedPaymentMethods || PAYMENT_METHODS).map((method) => <option key={method} value={method}>{method}</option>)}
          </select>
          <input className="input" placeholder="UTR / transaction reference" value={form.transactionReference} onChange={(e) => setForm((prev) => ({ ...prev, transactionReference: e.target.value }))} />
          <input className="input" type="date" value={form.paymentDate} onChange={(e) => setForm((prev) => ({ ...prev, paymentDate: e.target.value }))} />
          <input className="input" type="file" accept="image/*,application/pdf" onChange={(e) => setForm((prev) => ({ ...prev, receipt: e.target.files?.[0] || null }))} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Submitting...' : 'Submit'}</button>
        </div>
      </form>
    </Modal>
  );
}

function PlanModal({ isOpen, onClose, onDone }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ planName: '', requiredAmount: '', durationMonths: '', monthlyReturn: '' });
  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await createInvestmentPlan(form);
      showToast('Investment plan created', 'success');
      onClose();
      await onDone();
    } catch (err) {
      showToast(err.message || 'Failed to create plan', 'error');
    }
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Investment Plan" maxWidth={520}>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
        <input className="input" placeholder="Plan name" value={form.planName} onChange={(e) => setForm((prev) => ({ ...prev, planName: e.target.value }))} />
        <input className="input" type="number" placeholder="Required amount" value={form.requiredAmount} onChange={(e) => setForm((prev) => ({ ...prev, requiredAmount: e.target.value }))} />
        <input className="input" type="number" placeholder="Duration months" value={form.durationMonths} onChange={(e) => setForm((prev) => ({ ...prev, durationMonths: e.target.value }))} />
        <input className="input" type="number" placeholder="Monthly return" value={form.monthlyReturn} onChange={(e) => setForm((prev) => ({ ...prev, monthlyReturn: e.target.value }))} />
        <button className="btn btn-primary" type="submit">Create Plan</button>
      </form>
    </Modal>
  );
}

function AssignInvestmentModal({ isOpen, onClose, onDone, plans, users }) {
  const { showToast } = useToast();
  const customers = users.filter((item) => item.role === 'customer');
  const [form, setForm] = useState({ customerId: '', planId: '' });
  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await createInvestmentForCustomer(form);
      showToast('Investment assigned', 'success');
      onClose();
      await onDone();
    } catch (err) {
      showToast(err.message || 'Failed to assign investment', 'error');
    }
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Assign Investment" maxWidth={520}>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
        <select className="input" value={form.customerId} onChange={(e) => setForm((prev) => ({ ...prev, customerId: e.target.value }))}>
          <option value="">Select customer</option>
          {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName} ({customer.customerId || customer.email})</option>)}
        </select>
        <select className="input" value={form.planId} onChange={(e) => setForm((prev) => ({ ...prev, planId: e.target.value }))}>
          <option value="">Select plan</option>
          {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.planName} - {formatAmount(plan.requiredAmount || 0)}</option>)}
        </select>
        <button className="btn btn-primary" type="submit">Assign</button>
      </form>
    </Modal>
  );
}

function OfficeCollectionModal({ isOpen, onClose, onDone, investments }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ investmentId: '', amount: '', paymentMethod: 'Office Collection', transactionReference: '', notes: '' });
  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await createOfficeCollection(form);
      showToast('Office collection recorded for verification', 'success');
      onClose();
      await onDone();
    } catch (err) {
      showToast(err.message || 'Failed to record collection', 'error');
    }
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Office Collection" maxWidth={560}>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
        <select className="input" value={form.investmentId} onChange={(e) => setForm((prev) => ({ ...prev, investmentId: e.target.value }))}>
          <option value="">Select investment</option>
          {investments.map((item) => <option key={item.id} value={item.id}>{item.customerName} - {item.planSnapshot?.planName}</option>)}
        </select>
        <input className="input" type="number" placeholder="Collected amount" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} />
        <select className="input" value={form.paymentMethod} onChange={(e) => setForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}>
          <option value="Office Collection">Office Collection</option>
          <option value="Cash">Cash</option>
        </select>
        <input className="input" placeholder="Reference" value={form.transactionReference} onChange={(e) => setForm((prev) => ({ ...prev, transactionReference: e.target.value }))} />
        <textarea className="input" placeholder="Notes" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
        <button className="btn btn-primary" type="submit">Record Collection</button>
      </form>
    </Modal>
  );
}

function PayoutActionModal({ state, onClose, onDone }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ actualPaidDate: '', transactionReference: '' });
  const mode = state.mode || 'record';

  useEffect(() => {
    if (!state.open || !state.payout) return;
    setForm({
      actualPaidDate: state.payout.proposedActualPaidDate
        ? new Date(state.payout.proposedActualPaidDate?.toDate ? state.payout.proposedActualPaidDate.toDate() : state.payout.proposedActualPaidDate).toISOString().slice(0, 10)
        : '',
      transactionReference: state.payout.proposedTransactionReference || '',
      remarks: state.payout.payoutRemarks || '',
    });
  }, [state.open, state.payout]);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (mode === 'approve') {
        await approveInvestmentPayout({ payoutId: state.payout.id, ...form });
        showToast('Payout approved', 'success');
      } else {
        await recordInvestmentPayout({ payoutId: state.payout.id, ...form });
        showToast('Payout recorded for admin approval', 'success');
      }
      onClose();
      await onDone();
    } catch (err) {
      showToast(err.message || 'Failed to update payout', 'error');
    }
  }
  return (
    <Modal isOpen={state.open} onClose={onClose} title={mode === 'approve' ? 'Approve Payout' : 'Record Payout'} maxWidth={460}>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
        <input className="input" type="date" value={form.actualPaidDate} onChange={(e) => setForm((prev) => ({ ...prev, actualPaidDate: e.target.value }))} />
        <input className="input" placeholder="Transaction reference" value={form.transactionReference} onChange={(e) => setForm((prev) => ({ ...prev, transactionReference: e.target.value }))} />
        <textarea className="input" placeholder="Remarks" value={form.remarks || ''} onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))} />
        <button className="btn btn-primary" type="submit">{mode === 'approve' ? 'Approve Payout' : 'Record Payout'}</button>
      </form>
    </Modal>
  );
}
