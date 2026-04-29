import { 
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';

const COLLECTION = 'loans';
const col = collection(db, COLLECTION);

/**
 * Loan Service — Phase 6.3
 * 
 * Dedicated loans collection supporting multiple concurrent loans per customer.
 * Firestore rules enforce:
 *   - Customers: read own loans only (customerId == uid)
 *   - Staff: read loans for assigned customers
 *   - Admin: full access
 *   - Create/Update: Admin/Staff only (customers cannot self-issue)
 */

/**
 * Get loans scoped by role.
 */
export async function getLoans(userProfile) {
  const role = userProfile?.role;
  const uid = userProfile?.uid;

  if (role === 'admin') {
    const snap = await getDocs(query(col, orderBy('createdAt', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  if (role === 'staff') {
    const snap = await getDocs(query(
      col,
      where('assignedStaffId', '==', uid),
      orderBy('createdAt', 'desc')
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  if (role === 'customer') {
    const snap = await getDocs(query(
      col,
      where('customerId', '==', uid),
      orderBy('createdAt', 'desc')
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  return [];
}

/**
 * Get loans for a specific customer.
 * Used by the CustomerDashboard to show loan overview.
 */
export async function getLoansByCustomer(customerId) {
  const snap = await getDocs(query(
    col,
    where('customerId', '==', customerId),
    orderBy('createdAt', 'desc')
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Get only active loans for a customer (for dashboard summary).
 */
export async function getActiveLoans(customerId) {
  const snap = await getDocs(query(
    col,
    where('customerId', '==', customerId),
    where('status', '==', 'active')
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Get a single loan by ID.
 */
export async function getLoanById(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Create a new loan (Admin/Staff only).
 * 
 * Required fields:
 *   customerId, loanType, principalAmount, interestRate, tenureMonths
 * 
 * Auto-computed:
 *   emiAmount, remainingBalance, status, nextDueDate
 */
export async function createLoan(data) {
  const principal = parseInt(data.principalAmount) || 0;
  const rate = parseFloat(data.interestRate) || 0;
  const tenure = parseInt(data.tenureMonths) || 12;

  // Simple EMI calculation: P × r × (1+r)^n / ((1+r)^n - 1)
  // r = monthly interest rate (annual / 12 / 100)
  const monthlyRate = rate / 12 / 100;
  let emiAmount;
  if (monthlyRate === 0) {
    emiAmount = Math.round(principal / tenure);
  } else {
    const factor = Math.pow(1 + monthlyRate, tenure);
    emiAmount = Math.round(principal * monthlyRate * factor / (factor - 1));
  }

  const totalPayable = emiAmount * tenure;

  // Next due date: 1 month from now
  const nextDueDate = new Date();
  nextDueDate.setMonth(nextDueDate.getMonth() + 1);

  const loanData = {
    customerId: data.customerId,
    loanType: data.loanType || 'personal',
    principalAmount: principal,
    interestRate: rate,
    tenureMonths: tenure,
    emiAmount,
    totalPayable,
    totalPaid: 0,
    remainingBalance: totalPayable,
    completedEmis: 0,
    status: 'active',
    nextDueDate: nextDueDate.toISOString(),
    disbursedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    assignedStaffId: data.assignedStaffId || '',
    description: data.description || '',
  };

  const ref = await addDoc(col, loanData);
  return { id: ref.id, ...loanData };
}

/**
 * Record an EMI payment against a loan (Admin/Staff only).
 * Updates totalPaid, remainingBalance, completedEmis, and status.
 */
export async function recordLoanPayment(loanId, paymentAmount) {
  const loan = await getLoanById(loanId);
  if (!loan) throw new Error('Loan not found');

  const newTotalPaid = (loan.totalPaid || 0) + paymentAmount;
  const newRemaining = Math.max(0, (loan.totalPayable || loan.principalAmount) - newTotalPaid);
  const newCompletedEmis = (loan.completedEmis || 0) + 1;
  const isFullyPaid = newRemaining <= 0;

  // Compute next due date
  const nextDue = new Date(loan.nextDueDate || new Date());
  nextDue.setMonth(nextDue.getMonth() + 1);

  const updateData = {
    totalPaid: newTotalPaid,
    remainingBalance: newRemaining,
    completedEmis: newCompletedEmis,
    status: isFullyPaid ? 'completed' : 'active',
    nextDueDate: isFullyPaid ? null : nextDue.toISOString(),
    updatedAt: serverTimestamp(),
  };

  await updateDoc(doc(db, COLLECTION, loanId), updateData);
  return { ...loan, ...updateData };
}

/**
 * Update loan status (Admin/Staff — for defaulting, closing, etc).
 */
export async function updateLoanStatus(loanId, status) {
  await updateDoc(doc(db, COLLECTION, loanId), {
    status,
    updatedAt: serverTimestamp(),
  });
}
