import { 
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';

const COLLECTION = 'commissions';
const col = collection(db, COLLECTION);

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
    const snap = await getDocs(query(
      col,
      where('agentId', '==', uid),
      orderBy('createdAt', 'desc')
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // Staff and Customer have no commission access
  return [];
}

export async function getCommissionsByAgent(agentId) {
  const snap = await getDocs(query(
    col,
    where('agentId', '==', agentId),
    orderBy('createdAt', 'desc')
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
  const snap = await getDocs(query(
    col,
    where('agentId', '==', agentId),
    where('status', '==', status),
    orderBy('createdAt', 'desc')
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
