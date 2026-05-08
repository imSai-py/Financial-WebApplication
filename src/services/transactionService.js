import { 
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp, Timestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { getSettings } from './settingsService';

const COLLECTION = 'transactions';
const col = collection(db, COLLECTION);

/**
 * Get transactions scoped by role.
 * - Admin:    all transactions
 * - Staff:    transactions they processed (staffId) + assigned customer transactions (Q2)
 * - Customer: only their own transactions (customerId)
 * - Agent:    only their own transactions (agentId)
 *
 * NOTE on Q2 — Staff cross-visibility:
 * Staff now have TWO query paths. Firestore doesn't support OR queries across
 * different fields, so we run two queries and merge+deduplicate results.
 */
export async function getTransactions(userProfile) {
  const role = userProfile?.role;
  const uid = userProfile?.uid;

  if (role === 'admin') {
    const snap = await getDocs(query(col, orderBy('createdAt', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  if (role === 'staff') {
    // Query 1: Transactions the staff member directly processed
    const processedSnap = await getDocs(query(
      col,
      where('staffId', '==', uid),
      orderBy('createdAt', 'desc')
    ));

    // Query 2: Transactions for customers assigned to this staff member (Q2)
    const assignedSnap = await getDocs(query(
      col,
      where('assignedStaffId', '==', uid),
      orderBy('createdAt', 'desc')
    ));

    // Merge and deduplicate by document ID
    const seen = new Set();
    const merged = [];

    for (const d of processedSnap.docs) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        merged.push({ id: d.id, ...d.data() });
      }
    }
    for (const d of assignedSnap.docs) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        merged.push({ id: d.id, ...d.data() });
      }
    }

    // Sort merged results by createdAt descending
    merged.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });

    return merged;
  }

  if (role === 'customer') {
    const snap = await getDocs(query(
      col,
      where('customerId', '==', uid),
      orderBy('createdAt', 'desc')
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  if (role === 'agent') {
    const snap = await getDocs(query(
      col,
      where('agentId', '==', uid),
      orderBy('createdAt', 'desc')
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  return [];
}

export async function getTransactionsForStaffHistory(staffId) {
  const processedSnap = await getDocs(query(
    col,
    where('staffId', '==', staffId),
    orderBy('createdAt', 'desc')
  ));

  const assignedSnap = await getDocs(query(
    col,
    where('assignedStaffId', '==', staffId),
    orderBy('createdAt', 'desc')
  ));

  const seen = new Set();
  const merged = [];

  for (const d of processedSnap.docs) {
    if (!seen.has(d.id)) {
      seen.add(d.id);
      merged.push({ id: d.id, ...d.data() });
    }
  }

  for (const d of assignedSnap.docs) {
    if (!seen.has(d.id)) {
      seen.add(d.id);
      merged.push({ id: d.id, ...d.data() });
    }
  }

  merged.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || 0;
    const bTime = b.createdAt?.toMillis?.() || 0;
    return bTime - aTime;
  });

  return merged;
}

export async function getTransactionById(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getTransactionsByCustomer(customerId) {
  const snap = await getDocs(query(
    col,
    where('customerId', '==', customerId),
    orderBy('createdAt', 'desc')
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getTransactionsByAgent(agentId) {
  const snap = await getDocs(query(
    col,
    where('agentId', '==', agentId),
    orderBy('createdAt', 'desc')
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Create a transaction with automated agent and staff tagging (Q1 + Q2).
 *
 * Flow:
 *   1. Lookup the customer's profile
 *   2. If customer has an `onboardedByAgent` field → auto-set `agentId` (Q1)
 *   3. If customer has an `assignedStaffId` field → denormalize onto transaction (Q2)
 *   4. If the creator is Staff → tag with `staffId`
 *   5. If the creator is Agent → force `agentId` to self (security rule also enforces)
 *
 * This enables automated commission tracking without manual agent selection.
 */
export async function createTransaction(data, userProfile) {
  const txData = {
    ...data,
    status: 'pending', // Always starts as pending
    // Dual-date model: System Date (createdAt) vs Effective Date (effectiveDate)
    // createdAt: server-generated, tamper-proof — used for ordering & audit
    // effectiveDate: user-supplied value date — used for financial reporting
    effectiveDate: data.effectiveDate || Timestamp.now(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // ── Retrieve dynamic limits from Admin Settings ──
  try {
    const settings = await getSettings();
    if (data.amount < settings.minTransactionAmount) {
      throw new Error(`Amount must be at least ₹${settings.minTransactionAmount}`);
    }
    if (data.amount > settings.maxTransactionAmount) {
      throw new Error(`Amount strongly exceeds maximum allowed: ₹${settings.maxTransactionAmount}`);
    }
    
    // Auto-approve if below threshold
    if (data.amount <= settings.autoApprovalThreshold && userProfile?.role !== 'customer') {
      txData.status = 'completed'; // staff/agent transactions auto-complete if under threshold
    }
  } catch (err) {
    if (err.message.includes('Amount')) throw err;
    console.warn('Failed to load transaction settings:', err);
  }

  // ── Auto-tagging: Lookup customer profile for agent/staff associations ──
  if (data.customerId) {
    try {
      const customerDoc = await getDoc(doc(db, 'users', data.customerId));
      if (customerDoc.exists()) {
        const customerData = customerDoc.data();

        // Q1: Auto-populate agentId from customer's onboarding agent
        // (only if not already set and creator is not the agent themselves)
        if (!txData.agentId && customerData.onboardedByAgent) {
          txData.agentId = customerData.onboardedByAgent;
        }

        // Q2: Denormalize assignedStaffId onto the transaction
        // This enables the Staff cross-visibility query
        if (customerData.assignedStaffId) {
          txData.assignedStaffId = customerData.assignedStaffId;
        }
      }
    } catch (err) {
      // Non-fatal: proceed without auto-tagging if customer lookup fails
      console.warn('Auto-tagging: customer lookup failed:', err.message);
    }
  }

  // If agent creates the transaction, force agentId to self (rules also enforce)
  if (userProfile?.role === 'agent') {
    txData.agentId = userProfile.uid;
  }

  // If staff creates the transaction, tag with staffId
  if (userProfile?.role === 'staff') {
    txData.staffId = userProfile.uid;
  }

  const ref = await addDoc(col, txData);
  return { id: ref.id, ...txData };
}

export async function updateTransaction(id, data) {
  // Only status and updatedAt can be changed (rules enforce this too)
  await updateDoc(doc(db, COLLECTION, id), {
    status: data.status,
    updatedAt: serverTimestamp(),
  });
}

// ═══════════════════════════════════════════════════════
// Customer Payment Functions (Phase 6.3)
// ═══════════════════════════════════════════════════════

/**
 * Per-transaction cap (in paise). ₹50,000.
 * Also enforced by Firestore rules as a backstop.
 */
const PER_TX_LIMIT = 5000000; // ₹50,000 in paise

/**
 * Daily aggregate cap (in paise). ₹1,00,000.
 * Enforced client-side (Firestore rules can't do aggregation).
 */
const DAILY_AGGREGATE_LIMIT = 10000000; // ₹1,00,000 in paise

/**
 * Compute a customer's current balance from their completed transactions.
 * Balance = sum(completed deposits + refunds) - sum(completed withdrawals + payments + transfers)
 */
export async function getCustomerBalance(customerId) {
  const snap = await getDocs(query(
    col,
    where('customerId', '==', customerId),
    orderBy('createdAt', 'desc')
  ));

  let balance = 0;
  for (const d of snap.docs) {
    const tx = d.data();
    if (tx.status !== 'completed') continue;
    const amount = tx.amount || 0;
    if (tx.type === 'deposit' || tx.type === 'refund') {
      balance += amount;
    } else {
      balance -= amount;
    }
  }
  return balance;
}

/**
 * Get the total amount of customer-initiated transactions for today.
 * Used for daily aggregate limit enforcement.
 */
export async function getDailyTransactionTotal(customerId) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const snap = await getDocs(query(
    col,
    where('customerId', '==', customerId),
    orderBy('createdAt', 'desc')
  ));

  let dailyTotal = 0;
  for (const d of snap.docs) {
    const tx = d.data();
    // Only count customer-initiated payment/transfer types
    if (!['payment', 'transfer'].includes(tx.type)) continue;
    // Only count today's transactions
    const txDate = tx.createdAt?.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt);
    if (txDate >= startOfDay) {
      dailyTotal += tx.amount || 0;
    }
  }
  return dailyTotal;
}

/**
 * Create a customer-initiated payment (internal ledger).
 * 
 * Security layers:
 *   1. Client: validates amount, balance, per-tx limit, daily aggregate
 *   2. Firestore rule: forces customerId == auth.uid, caps at ₹50K
 *   3. Idempotency key: prevents duplicate submissions
 * 
 * @param {Object} data - { amount, type, description, recipientId, idempotencyKey }
 * @param {Object} userProfile - authenticated user's profile
 * @returns {Object} { success, transaction?, error? }
 */
export async function createCustomerPayment(data, userProfile) {
  const uid = userProfile.uid;
  const amount = parseInt(data.amount);

  // ── Validation Layer ──

  if (!amount || amount <= 0) {
    return { success: false, error: 'Invalid amount' };
  }

  if (amount > PER_TX_LIMIT) {
    return { success: false, error: `Amount exceeds per-transaction limit of ₹${(PER_TX_LIMIT / 100).toLocaleString('en-IN')}` };
  }

  if (!['payment', 'transfer'].includes(data.type)) {
    return { success: false, error: 'Invalid transaction type' };
  }

  // ── Balance Check ──
  const balance = await getCustomerBalance(uid);
  if (amount > balance) {
    return { success: false, error: `Insufficient balance. Available: ₹${(balance / 100).toLocaleString('en-IN')}` };
  }

  // ── Daily Aggregate Check ──
  const dailyTotal = await getDailyTransactionTotal(uid);
  if (dailyTotal + amount > DAILY_AGGREGATE_LIMIT) {
    const remaining = Math.max(0, DAILY_AGGREGATE_LIMIT - dailyTotal);
    return { 
      success: false, 
      error: `Daily limit exceeded. Remaining today: ₹${(remaining / 100).toLocaleString('en-IN')}` 
    };
  }

  // ── Idempotency Check ──
  if (data.idempotencyKey) {
    const existing = await getDocs(query(
      col,
      where('idempotencyKey', '==', data.idempotencyKey),
      where('customerId', '==', uid)
    ));
    if (!existing.empty) {
      const existingTx = { id: existing.docs[0].id, ...existing.docs[0].data() };
      return { success: true, transaction: existingTx, duplicate: true };
    }
  }

  // ── Create Transaction ──
  try {
    const txData = {
      type: data.type,
      amount,
      customerId: uid,
      description: data.description || '',
      recipientId: data.recipientId || '',
      status: 'pending',
      idempotencyKey: data.idempotencyKey || '',
      initiatedBy: 'customer',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const ref = await addDoc(col, txData);
    const transaction = { id: ref.id, ...txData };

    return { success: true, transaction };
  } catch (err) {
    console.error('Payment creation failed:', err);
    return { success: false, error: err.message || 'Payment failed. Please try again.' };
  }
}

/**
 * Write a payment receipt email to the mail collection.
 * Firebase "Trigger Email" extension picks this up and sends it.
 */
export async function sendPaymentReceipt(transaction, userProfile) {
  try {
    const mailCol = collection(db, 'mail');
    await addDoc(mailCol, {
      to: userProfile.email,
      message: {
        subject: `FinanceFlow — Payment Receipt #${transaction.id.slice(0, 8).toUpperCase()}`,
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #6366f1;">FinanceFlow Payment Receipt</h2>
            <hr style="border-color: #e2e8f0;" />
            <p><strong>Transaction ID:</strong> ${transaction.id}</p>
            <p><strong>Type:</strong> ${transaction.type}</p>
            <p><strong>Amount:</strong> ₹${((transaction.amount || 0) / 100).toLocaleString('en-IN')}</p>
            <p><strong>Status:</strong> ${transaction.status}</p>
            <p><strong>Description:</strong> ${transaction.description || 'N/A'}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleString('en-IN')}</p>
            <hr style="border-color: #e2e8f0;" />
            <p style="font-size: 12px; color: #94a3b8;">
              This is an automated receipt from FinanceFlow Management.
              Please retain this email for your records.
            </p>
          </div>
        `,
      },
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    // Non-fatal: don't block payment if email fails
    console.warn('Email receipt failed:', err.message);
  }
}

// ═══════════════════════════════════════════════════════
// Date-Range Query Functions (Phase 7 — DAL)
// ═══════════════════════════════════════════════════════

/**
 * Get transactions within a date range, scoped by role.
 *
 * Uses the `effectiveDate` field (user-supplied Value Date) for filtering.
 * Falls back to `createdAt` for transactions created before Phase 7
 * (those won't have `effectiveDate`).
 *
 * NOTE: Firestore inequality filters (`>=`, `<=`) can only target ONE field,
 * so role-scoped access (equality filter on staffId/customerId/agentId)
 * + date range (inequality on effectiveDate) works within a single query.
 *
 * @param {Object} userProfile - { uid, role }
 * @param {Date} startDate - Range start (inclusive)
 * @param {Date} endDate - Range end (inclusive)
 * @returns {Array} Matching transactions sorted by effectiveDate descending
 */
export async function getTransactionsByDateRange(userProfile, startDate, endDate) {
  const role = userProfile?.role;
  const uid = userProfile?.uid;

  const start = Timestamp.fromDate(new Date(startDate));
  const end = Timestamp.fromDate(new Date(endDate));

  if (role === 'admin') {
    // Admin: all transactions in date range
    const snap = await getDocs(query(
      col,
      where('effectiveDate', '>=', start),
      where('effectiveDate', '<=', end),
      orderBy('effectiveDate', 'desc')
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  if (role === 'staff') {
    // Staff: transactions they processed in date range
    // NOTE: Firestore doesn't support inequality on effectiveDate + equality on staffId
    //       in the same query without a composite index. We fetch by staffId and filter client-side.
    const snap = await getDocs(query(
      col,
      where('staffId', '==', uid),
      orderBy('createdAt', 'desc')
    ));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(tx => {
        const txDate = tx.effectiveDate?.toDate?.() || tx.createdAt?.toDate?.() || new Date(0);
        return txDate >= new Date(startDate) && txDate <= new Date(endDate);
      });
  }

  if (role === 'customer') {
    // Customer: own transactions in date range
    const snap = await getDocs(query(
      col,
      where('customerId', '==', uid),
      where('effectiveDate', '>=', start),
      where('effectiveDate', '<=', end),
      orderBy('effectiveDate', 'desc')
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  if (role === 'agent') {
    // Agent: own transactions in date range
    const snap = await getDocs(query(
      col,
      where('agentId', '==', uid),
      orderBy('createdAt', 'desc')
    ));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(tx => {
        const txDate = tx.effectiveDate?.toDate?.() || tx.createdAt?.toDate?.() || new Date(0);
        return txDate >= new Date(startDate) && txDate <= new Date(endDate);
      });
  }

  return [];
}

/**
 * Get transactions for a specific customer within a date range.
 * Uses composite index: customerId + effectiveDate.
 *
 * Used by:
 *   - Report generation (customer statement)
 *   - Admin/Staff customer detail views
 *   - Customer's own filtered transaction history
 *
 * @param {string} customerId - Customer UID
 * @param {Date} startDate - Range start (inclusive)
 * @param {Date} endDate - Range end (inclusive)
 * @returns {Array} Matching transactions sorted by effectiveDate descending
 */
export async function getTransactionsByCustomerAndDate(customerId, startDate, endDate) {
  const start = Timestamp.fromDate(new Date(startDate));
  const end = Timestamp.fromDate(new Date(endDate));

  const snap = await getDocs(query(
    col,
    where('customerId', '==', customerId),
    where('effectiveDate', '>=', start),
    where('effectiveDate', '<=', end),
    orderBy('effectiveDate', 'desc')
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
