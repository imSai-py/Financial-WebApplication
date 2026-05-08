import { 
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';

const COLLECTION = 'commissions';
const col = collection(db, COLLECTION);

function dedupeCommissions(records = []) {
  const merged = new Map();
  records.forEach((record) => {
    if (!record?.id) return;
    merged.set(record.id, record);
  });
  return Array.from(merged.values()).sort((a, b) => {
    const left = typeof a.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : 0;
    const right = typeof b.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : 0;
    return right - left;
  });
}

/**
 * Get commissions scoped by role.
 * - Admin: all commissions
 * - Agent: only their own commissions
 * - Staff/Customer: no access
 */
export async function getCommissions(userProfile) {
  const role = userProfile?.role;
  const uid = userProfile?.uid;

  if (role === 'admin') {
    const snap = await getDocs(query(col, orderBy('createdAt', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  if (role === 'agent') {
    return getCommissionsByAgent(uid);
  }

  // Staff and Customer have no commission access
  return [];
}

export async function getCommissionsByAgent(agentId) {
  const [directSnap, beneficiarySnap] = await Promise.all([
    getDocs(query(
      col,
      where('agentId', '==', agentId),
      orderBy('createdAt', 'desc')
    )),
    getDocs(query(
      col,
      where('beneficiaryId', '==', agentId),
      orderBy('createdAt', 'desc')
    )),
  ]);

  return dedupeCommissions([
    ...directSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    ...beneficiarySnap.docs.map(d => ({ id: d.id, ...d.data() })),
  ]);
}

export async function getReferralCommissions() {
  const snap = await getDocs(query(col, orderBy('createdAt', 'desc')));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter((record) => record.type === 'customer_referral_commission');
}

export async function getReferralCommissionsByBeneficiary(beneficiaryId) {
  const snap = await getDocs(query(
    col,
    where('beneficiaryId', '==', beneficiaryId),
    orderBy('createdAt', 'desc')
  ));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter((record) => record.type === 'customer_referral_commission');
}

export async function getCommissionById(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Create a commission — Admin only.
 * Rules enforce: amount is int > 0, rate is 0-100, status is valid.
 */
export async function createCommission(data) {
  const commData = {
    ...data,
    status: data.status || 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(col, commData);
  return { id: ref.id, ...commData };
}

/**
 * Update a commission — Admin only.
 * Only status can change (rules enforce amount/rate immutability).
 */
export async function updateCommission(id, data) {
  await updateDoc(doc(db, COLLECTION, id), {
    status: data.status,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Get commissions for a specific agent filtered by status.
 * Uses composite index: agentId + status + createdAt.
 *
 * @param {string} agentId - The UID of the agent
 * @param {string} status - Commission status: 'pending', 'paid', 'cancelled'
 * @returns {Array} Matching commissions sorted by creation date (newest first)
 */
export async function getCommissionsByStatus(agentId, status) {
  const [directSnap, beneficiarySnap] = await Promise.all([
    getDocs(query(
      col,
      where('agentId', '==', agentId),
      where('status', '==', status),
      orderBy('createdAt', 'desc')
    )),
    getDocs(query(
      col,
      where('beneficiaryId', '==', agentId),
      where('status', '==', status),
      orderBy('createdAt', 'desc')
    )),
  ]);

  return dedupeCommissions([
    ...directSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    ...beneficiarySnap.docs.map(d => ({ id: d.id, ...d.data() })),
  ]);
}

export function summarizeReferralEarnings(commissions = []) {
  return commissions.reduce((summary, commission) => {
    const level = commission.level || 0;
    const amount = commission.amount || 0;
    const key = `level${level}`;
    summary.total += amount;
    summary.count += 1;
    summary.byLevel[key] = (summary.byLevel[key] || 0) + amount;
    return summary;
  }, {
    total: 0,
    count: 0,
    byLevel: {},
  });
}
