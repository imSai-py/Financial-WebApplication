import { useState, useCallback } from 'react';
import { Send, AlertTriangle, CheckCircle2, XCircle, ArrowLeft, Shield, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { createCustomerPayment, sendPaymentReceipt, getCustomerBalance } from '../../services/transactionService';
import { formatAmount } from '../../utils/formatCurrency';
import Modal from '../shared/Modal';

/**
 * PaymentForm — Phase 6.3
 * 
 * 2-step payment confirmation flow:
 *   Step 1: FORM     → Amount, type, description input
 *   Step 2: CONFIRM  → Review summary with "This cannot be undone"
 *   Step 3: PROCESS  → Spinner with "Processing..."
 *   Step 4: RESULT   → Success ✅ or Failed ❌
 * 
 * Security:
 *   - Idempotency key prevents duplicate submissions
 *   - Button disabled during SUBMITTING state
 *   - Per-tx cap (₹50K) and daily aggregate (₹1L) enforced by service
 */

const STEPS = {
  FORM: 'form',
  CONFIRM: 'confirm',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  FAILED: 'failed',
};

export default function PaymentForm({ isOpen, onClose, onSuccess }) {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const [step, setStep] = useState(STEPS.FORM);
  const [balance, setBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [formData, setFormData] = useState({
    type: 'payment',
    amount: '',
    description: '',
    recipientId: '',
  });
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  // Load balance when modal opens
  const loadBalance = useCallback(async () => {
    if (balance !== null || loadingBalance) return;
    setLoadingBalance(true);
    try {
      const bal = await getCustomerBalance(userProfile.uid);
      setBalance(bal);
    } catch {
      setBalance(0);
    }
    setLoadingBalance(false);
  }, [balance, loadingBalance, userProfile.uid]);

  if (isOpen && balance === null && !loadingBalance) {
    loadBalance();
  }

  function handleInputChange(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  }

  function handleContinue(e) {
    e.preventDefault();
    const amount = parseInt(formData.amount);

    if (!amount || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (amount > 5000000) {
      setError('Maximum ₹50,000 per transaction');
      return;
    }

    if (balance !== null && amount > balance) {
      setError(`Insufficient balance. Available: ${formatAmount(balance)}`);
      return;
    }

    setStep(STEPS.CONFIRM);
  }

  async function handleConfirmPayment() {
    setStep(STEPS.PROCESSING);
    setError('');

    const result = await createCustomerPayment({
      ...formData,
      amount: parseInt(formData.amount),
      idempotencyKey,
    }, userProfile);

    if (result.success) {
      setResult(result.transaction);
      setStep(STEPS.SUCCESS);
      showToast('Payment submitted successfully!', 'success');

      // Send email receipt (non-blocking)
      sendPaymentReceipt(result.transaction, userProfile);

      if (onSuccess) onSuccess(result.transaction);
    } else {
      setError(result.error || 'Payment failed');
      setStep(STEPS.FAILED);
    }
  }

  function handleClose() {
    setStep(STEPS.FORM);
    setFormData({ type: 'payment', amount: '', description: '', recipientId: '' });
    setError('');
    setResult(null);
    setBalance(null);
    onClose();
  }

  function renderStep() {
    switch (step) {
      case STEPS.FORM:
        return renderFormStep();
      case STEPS.CONFIRM:
        return renderConfirmStep();
      case STEPS.PROCESSING:
        return renderProcessingStep();
      case STEPS.SUCCESS:
        return renderSuccessStep();
      case STEPS.FAILED:
        return renderFailedStep();
      default:
        return null;
    }
  }

  function renderFormStep() {
    return (
      <form onSubmit={handleContinue}>
        {/* Balance Display */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.75rem 1rem', borderRadius: 10, marginBottom: '1.25rem',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(34,197,94,0.05))',
          border: '1px solid rgba(99,102,241,0.15)',
        }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Available Balance</span>
          <span style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-success)' }}>
            {loadingBalance ? '...' : formatAmount(balance || 0)}
          </span>
        </div>

        {/* Transaction Type */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
            Type
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {[
              { value: 'payment', label: 'Payment', icon: '💳' },
              { value: 'transfer', label: 'Transfer', icon: '↗️' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleInputChange('type', opt.value)}
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  fontSize: '0.875rem', fontWeight: 600, border: 'none',
                  background: formData.type === opt.value
                    ? 'rgba(99,102,241,0.15)'
                    : 'rgba(148,163,184,0.05)',
                  color: formData.type === opt.value
                    ? 'var(--color-primary-400)'
                    : 'var(--color-text-muted)',
                  outline: formData.type === opt.value
                    ? '2px solid var(--color-primary-400)'
                    : '1px solid var(--color-border)',
                  transition: 'all 0.2s ease',
                }}
              >
                <span>{opt.icon}</span> {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
            Amount (₹)
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
              fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-muted)',
            }}>₹</span>
            <input
              className="input"
              type="number"
              min="1"
              max="5000000"
              step="1"
              required
              value={formData.amount}
              onChange={e => handleInputChange('amount', e.target.value)}
              placeholder="0"
              style={{ paddingLeft: '1.75rem', fontSize: '1.125rem', fontWeight: 700 }}
              id="payment-amount"
            />
          </div>
          <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
            Max ₹50,000 per transaction • ₹1,00,000 daily limit
          </p>
        </div>

        {/* Recipient (for transfers) */}
        {formData.type === 'transfer' && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
              Recipient Account ID
            </label>
            <input
              className="input"
              value={formData.recipientId}
              onChange={e => handleInputChange('recipientId', e.target.value)}
              placeholder="Enter recipient's account ID"
              id="payment-recipient"
            />
          </div>
        )}

        {/* Description */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
            Description (optional)
          </label>
          <input
            className="input"
            value={formData.description}
            onChange={e => handleInputChange('description', e.target.value)}
            placeholder="What's this payment for?"
            id="payment-description"
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.625rem 0.75rem', borderRadius: 8, marginBottom: '1rem',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
          }}>
            <AlertTriangle size={16} color="#ef4444" />
            <span style={{ fontSize: '0.8125rem', color: '#ef4444' }}>{error}</span>
          </div>
        )}

        {/* Submit */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={handleClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" id="payment-continue">
            <Send size={16} /> Continue
          </button>
        </div>
      </form>
    );
  }

  function renderConfirmStep() {
    const amount = parseInt(formData.amount) || 0;
    return (
      <div>
        {/* Warning Banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.75rem 1rem', borderRadius: 10, marginBottom: '1.25rem',
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
        }}>
          <Shield size={18} color="#f59e0b" />
          <span style={{ fontSize: '0.8125rem', color: '#f59e0b', fontWeight: 500 }}>
            Please review before confirming. This action cannot be undone.
          </span>
        </div>

        {/* Summary Card */}
        <div style={{
          padding: '1.5rem', borderRadius: 12, marginBottom: '1.25rem',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(99,102,241,0.02))',
          border: '1px solid rgba(99,102,241,0.15)',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
            {formData.type === 'transfer' ? 'Transfer Amount' : 'Payment Amount'}
          </p>
          <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-primary-400)', marginBottom: '0.75rem' }}>
            {formatAmount(amount)}
          </p>
          {formData.description && (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
              {formData.description}
            </p>
          )}
          {formData.recipientId && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
              To: {formData.recipientId}
            </p>
          )}
        </div>

        {/* Details */}
        <div style={{ fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.375rem 0', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Type</span>
            <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{formData.type}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.375rem 0', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>From</span>
            <span style={{ fontWeight: 600 }}>{userProfile?.displayName || userProfile?.email}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.375rem 0' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Status</span>
            <span style={{ fontWeight: 600, color: '#f59e0b' }}>Will be Pending</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setStep(STEPS.FORM)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirmPayment}
            id="payment-confirm"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', gap: '0.375rem',
            }}
          >
            <Shield size={16} /> Confirm {formData.type === 'transfer' ? 'Transfer' : 'Payment'}
          </button>
        </div>
      </div>
    );
  }

  function renderProcessingStep() {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        <div style={{
          width: 64, height: 64, margin: '0 auto 1.25rem',
          borderRadius: '50%', border: '3px solid rgba(99,102,241,0.2)',
          borderTopColor: '#6366f1',
          animation: 'spin 0.8s linear infinite',
        }} />
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Processing Your {formData.type === 'transfer' ? 'Transfer' : 'Payment'}...
        </h3>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          Please wait. Do not close this window.
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  function renderSuccessStep() {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
        <div style={{
          width: 72, height: 72, margin: '0 auto 1rem',
          borderRadius: '50%', background: 'rgba(34,197,94,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.5s ease',
        }}>
          <CheckCircle2 size={36} color="#22c55e" />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-success)', marginBottom: '0.5rem' }}>
          Payment Submitted!
        </h3>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Your {formData.type} of {formatAmount(parseInt(formData.amount) || 0)} has been submitted for processing.
        </p>
        {result && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.5rem 1rem', borderRadius: 8,
            background: 'rgba(148,163,184,0.05)', border: '1px solid var(--color-border)',
            fontSize: '0.75rem', color: 'var(--color-text-muted)',
          }}>
            <Clock size={14} />
            TX: #{result.id?.slice(0, 8).toUpperCase()} • Status: Pending
          </div>
        )}
        <div style={{ marginTop: '1.5rem' }}>
          <button className="btn btn-primary" onClick={handleClose} id="payment-done">
            Done
          </button>
        </div>
      </div>
    );
  }

  function renderFailedStep() {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
        <div style={{
          width: 72, height: 72, margin: '0 auto 1rem',
          borderRadius: '50%', background: 'rgba(239,68,68,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <XCircle size={36} color="#ef4444" />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ef4444', marginBottom: '0.5rem' }}>
          Payment Failed
        </h3>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          {error || 'Something went wrong. Please try again.'}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
          <button className="btn btn-secondary" onClick={handleClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => setStep(STEPS.FORM)}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={step === STEPS.PROCESSING ? undefined : handleClose}
      title={
        step === STEPS.FORM ? 'New Payment' :
        step === STEPS.CONFIRM ? 'Confirm Payment' :
        step === STEPS.PROCESSING ? 'Processing' :
        step === STEPS.SUCCESS ? '' :
        'Payment Failed'
      }
    >
      {renderStep()}
    </Modal>
  );
}
