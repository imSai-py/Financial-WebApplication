import { 
  collection, getDocs, addDoc, query, orderBy, limit, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';

const COLLECTION = 'activityLogs';
const col = collection(db, COLLECTION);

/**
 * Get activity logs — Admin only.
 * Firestore Rules enforce admin-only read access.
 */
export async function getActivityLogs(maxItems = 100) {
  const snap = await getDocs(
    query(col, orderBy('timestamp', 'desc'), limit(maxItems))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Log an activity — any authenticated active user.
 * Firestore Rules enforce:
 * - userId must equal the authenticated user's UID
 * - Logs are immutable (no update/delete ever)
 * 
 * @param {Object} params
 * @param {string} params.userId - UID of user performing the action
 * @param {string} params.action - Action identifier (e.g., 'transaction.create')
 * @param {string} params.details - Human-readable description
 * @param {string} [params.resourceType] - 'user' | 'transaction' | 'task' | 'commission'
 * @param {string} [params.resourceId] - ID of the affected resource
 */
export async function logActivity({ userId, action, details, resourceType = '', resourceId = '' }) {
  if (!userId || !action) return;

  try {
    await addDoc(col, {
      userId,
      action,
      details,
      resourceType,
      resourceId,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    // Silently fail — activity logging should never break the main flow
    console.warn('Activity log failed:', err.message);
  }
}
