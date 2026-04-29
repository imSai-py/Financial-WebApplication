import { 
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  query, where, orderBy, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { filterCustomerForAgent } from '../utils/rolePermissions';

const COLLECTION = 'users';
const col = collection(db, COLLECTION);

/**
 * Get all users — Admin only.
 * Returns all users sorted by creation date.
 */
export async function getAllUsers() {
  const snap = await getDocs(query(col, orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Get users by role.
 * - Admin: any role
 * - Staff: only 'customer' role
 * - Others: no access (will return empty or throw from Firestore Rules)
 */
export async function getUsersByRole(role) {
  const snap = await getDocs(query(
    col,
    where('role', '==', role),
    orderBy('createdAt', 'desc')
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getUserById(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Get customers onboarded by a specific agent (Q4).
 * 
 * Firestore Rules allow Agents to read customer docs where
 * `onboardedByAgent == agent.uid`. This function queries those docs
 * and filters to non-sensitive fields only.
 * 
 * @param {string} agentId - The UID of the agent
 * @returns {Array} Customer profiles with non-sensitive fields only
 */
export async function getOnboardedCustomers(agentId) {
  const snap = await getDocs(query(
    col,
    where('role', '==', 'customer'),
    where('onboardedByAgent', '==', agentId),
    orderBy('createdAt', 'desc')
  ));

  // Client-side field filtering — only return non-sensitive data
  return snap.docs.map(d => {
    const fullData = { id: d.id, ...d.data() };
    return filterCustomerForAgent(fullData);
  });
}

/**
 * Get customers assigned to a specific staff member (Phase 6.2).
 * 
 * Firestore Rules enforce: Staff can only read customer docs where
 * `assignedStaffId == staff.uid`. This query matches that rule.
 * 
 * @param {string} staffId - The UID of the staff member
 * @returns {Array} Customer profiles assigned to this staff member
 */
export async function getCustomersByStaff(staffId) {
  const snap = await getDocs(query(
    col,
    where('role', '==', 'customer'),
    where('assignedStaffId', '==', staffId),
    orderBy('createdAt', 'desc')
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Create a user profile — typically called during registration or by admin.
 */
export async function createUser(uid, data) {
  const userData = {
    uid,
    ...data,
    status: data.status || 'active',
    onboardedByAgent: data.onboardedByAgent || null,
    assignedStaffId: data.assignedStaffId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, COLLECTION, uid), userData);
  return userData;
}

/**
 * Update a user profile.
 * Firestore Rules enforce:
 * - Only admin can change roles (via Cloud Functions preferably)
 * - Users can only update own non-sensitive fields
 * - Admin cannot demote self
 * - onboardedByAgent is immutable for non-admins
 */
export async function updateUser(id, data) {
  await updateDoc(doc(db, COLLECTION, id), { ...data, updatedAt: serverTimestamp() });
}

/**
 * Delete a user — Admin only, cannot delete self (rules enforce this).
 */
export async function deleteUser(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

/**
 * Suspend a user — Admin only.
 */
export async function suspendUser(id) {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'suspended',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Reactivate a suspended user — Admin only.
 */
export async function reactivateUser(id) {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'active',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Assign a staff member to a customer — Admin only.
 * Sets the assignedStaffId field which enables cross-visibility (Q2).
 */
export async function assignStaffToCustomer(customerId, staffId) {
  await updateDoc(doc(db, COLLECTION, customerId), {
    assignedStaffId: staffId,
    updatedAt: serverTimestamp(),
  });
}

// ═══════════════════════════════════════════════════════
// Agent Onboarding — Create customer lead (Firestore only)
// ═══════════════════════════════════════════════════════

/**
 * Agent onboards a customer as a lead (no Firebase Auth account).
 * Creates a Firestore doc with auto-generated ID.
 *
 * Security:
 *   - Firestore rules enforce: isAgent() && role=='customer' && onboardedByAgent==auth.uid
 *   - Agent cannot set role to anything other than 'customer'
 *   - onboardedByAgent is force-set to agent's UID (immutable after creation)
 *
 * @param {string} agentUid - The agent's UID (from auth)
 * @param {object} customerData - { displayName, email, phone, dateOfBirth, panNumber, address }
 * @returns {object} The created customer document
 */
export async function onboardCustomer(agentUid, customerData) {
  if (!agentUid) throw new Error('Agent UID is required');
  if (!customerData.displayName?.trim()) throw new Error('Customer name is required');
  if (!customerData.email?.trim()) throw new Error('Customer email is required');

  // Pre-generate doc ID so we can include uid in the initial write
  // This avoids a separate updateDoc call (which requires UPDATE permissions)
  const docRef = doc(col);

  const leadData = {
    uid: docRef.id,
    displayName: customerData.displayName.trim(),
    email: customerData.email.trim().toLowerCase(),
    phone: customerData.phone?.trim() || null,
    dateOfBirth: customerData.dateOfBirth || null,
    panNumber: customerData.panNumber?.trim().toUpperCase() || null,
    aadhaarLastFour: customerData.aadhaarLastFour?.trim() || null,
    address: customerData.address || { street: '', city: '', state: '', zip: '' },
    role: 'customer',
    status: 'active',
    customerStatus: 'lead',
    kycStatus: 'not_submitted',
    kycVerifiedAt: null,
    kycVerifiedBy: null,
    onboardedByAgent: agentUid,
    assignedStaffId: null,
    hasAuthAccount: false,
    createdBy: agentUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(docRef, leadData);

  return { id: docRef.id, ...leadData };
}
