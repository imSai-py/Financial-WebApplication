import { 
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../config/firebase';
import { filterCustomerForAgent } from '../utils/rolePermissions';

const COLLECTION = 'users';
const col = collection(db, COLLECTION);
const CALLABLE_FALLBACK_CODES = new Set(['functions/internal', 'functions/unknown']);

function normalizeCallableCode(code) {
  if (typeof code !== 'string' || !code.trim()) return '';
  const trimmed = code.trim();
  return trimmed.startsWith('functions/') ? trimmed : `functions/${trimmed}`;
}

function shouldRetryCallableWithHttp(error) {
  const normalizedCode = normalizeCallableCode(error?.code);
  const normalizedMessage = typeof error?.message === 'string'
    ? error.message.trim().toLowerCase()
    : '';

  return CALLABLE_FALLBACK_CODES.has(normalizedCode)
    || normalizedMessage === 'internal'
    || normalizedMessage === 'unknown'
    || normalizedMessage === 'failed to fetch';
}

function buildFunctionHttpEndpoint(name) {
  if (name === 'createUserByAdminHttp' && typeof window !== 'undefined') {
    return '/api/createUserByAdmin';
  }

  const projectId = functions.app.options.projectId;
  const region = functions.region || 'us-central1';
  return `https://${region}-${projectId}.cloudfunctions.net/${name}`;
}

function buildCallableError(errorPayload = {}) {
  const status = typeof errorPayload.status === 'string' ? errorPayload.status.toLowerCase() : 'internal';
  const message = errorPayload.message || status || 'Callable request failed.';
  const error = new Error(message);
  error.code = `functions/${status}`;
  error.details = errorPayload.details;
  error.name = 'FirebaseError';
  return error;
}

async function invokeCallableWithHttpFallback(name, payload) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw buildCallableError({
      status: 'unauthenticated',
      message: 'Authentication required.',
    });
  }

  const idToken = await currentUser.getIdToken(true);
  const endpointName = name === 'createUserByAdmin' ? 'createUserByAdminHttp' : name;

  console.info(`[Firebase] Retrying ${name} via HTTP fallback endpoint ${endpointName}.`);

  const response = await fetch(buildFunctionHttpEndpoint(endpointName), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: payload }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw buildCallableError(body.error || {
      status: 'internal',
      message: 'Callable request failed before a response was received.',
    });
  }

  return body.result;
}

async function invokeCallable(name, payload) {
  const callable = httpsCallable(functions, name);

  try {
    const result = await callable(payload);
    return result.data;
  } catch (error) {
    console.error(`[Firebase] Callable ${name} failed.`, {
      code: error?.code || null,
      message: error?.message || String(error),
      details: error?.details || null,
    });

    if (!shouldRetryCallableWithHttp(error)) {
      throw error;
    }

    return invokeCallableWithHttpFallback(name, payload);
  }
}

function toMillis(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp?.toMillis === 'function') return timestamp.toMillis();
  if (typeof timestamp?.toDate === 'function') return timestamp.toDate().getTime();
  const parsed = new Date(timestamp).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getUserLabel(user) {
  if (!user) return 'Unknown';
  return user.displayName || user.email || 'Unknown';
}

function createUnknownSnapshot(id, role = 'unknown') {
  if (!id) return null;
  return { id, name: 'Unknown', role };
}

function normalizeReferralPath(path = []) {
  if (!Array.isArray(path)) return [];

  const seen = new Set();
  return path.reduce((entries, entry) => {
    if (!entry?.id || seen.has(entry.id)) return entries;
    seen.add(entry.id);
    entries.push({
      id: entry.id,
      name: entry.name || 'Unknown',
      role: entry.role || 'unknown',
    });
    return entries;
  }, []);
}

function dedupeById(records = []) {
  const merged = new Map();
  records.forEach((record) => {
    if (!record) return;
    merged.set(record.id || record.uid, record);
  });
  return Array.from(merged.values());
}

function normalizeManagedCustomerScope(customer, staffId) {
  const createdByStaff = customer.createdBy === staffId || customer.creator?.id === staffId;
  const assignedToStaff = customer.assignedStaffId === staffId;

  if (createdByStaff && assignedToStaff) {
    return {
      key: 'created_assigned',
      label: 'Created by me + Assigned to me',
    };
  }

  if (createdByStaff) {
    return {
      key: 'created',
      label: 'Created by me',
    };
  }

  if (assignedToStaff) {
    return {
      key: 'assigned',
      label: 'Assigned to me',
    };
  }

  return {
    key: 'other',
    label: 'Other',
  };
}

function deriveLegacyCreator(customer, userMap) {
  if (customer.creator?.id) {
    return {
      id: customer.creator.id,
      name: customer.creator.name || 'Unknown',
      role: customer.creator.role || 'unknown',
      timestamp: customer.creator.timestamp || customer.createdAt || null,
    };
  }

  if (customer.createdBy) {
    const creatorUser = userMap.get(customer.createdBy);
    const inferredRole =
      creatorUser?.role
      || (customer.createdBy === customer.onboardedByAgent ? 'agent' : null)
      || (customer.createdBy === customer.assignedStaffId ? 'staff' : null)
      || 'unknown';

    return {
      id: customer.createdBy,
      name: getUserLabel(creatorUser),
      role: inferredRole,
      timestamp: customer.createdAt || null,
    };
  }

  if (customer.onboardedByAgent) {
    const agentUser = userMap.get(customer.onboardedByAgent);
    return {
      id: customer.onboardedByAgent,
      name: getUserLabel(agentUser),
      role: agentUser?.role || 'agent',
      timestamp: customer.createdAt || null,
    };
  }

  if (customer.assignedStaffId) {
    const staffUser = userMap.get(customer.assignedStaffId);
    return {
      id: customer.assignedStaffId,
      name: getUserLabel(staffUser),
      role: staffUser?.role || 'staff',
      timestamp: customer.createdAt || null,
    };
  }

  return {
    id: 'Unknown',
    name: 'Unknown',
    role: 'unknown',
    timestamp: customer.createdAt || null,
  };
}

export function selectAdminCustomerTraceability(users = []) {
  const userMap = new Map(users.map(user => [user.id || user.uid, user]));

  return users
    .filter(user => user.role === 'customer')
    .map((customer) => {
      const creator = deriveLegacyCreator(customer, userMap);
      const staffUser = customer.assignedStaffId ? userMap.get(customer.assignedStaffId) : null;
      const agentUser = customer.onboardedByAgent ? userMap.get(customer.onboardedByAgent) : null;

      return {
        id: customer.id || customer.uid,
        customerId: customer.id || customer.uid,
        customerName: customer.displayName || 'Unnamed Customer',
        customerEmail: customer.email || '',
        creatorId: creator?.id || 'Unknown',
        creatorName: creator?.name || 'Unknown',
        creatorRole: creator?.role || 'unknown',
        creatorTimestamp: creator?.timestamp || customer.createdAt || null,
        createdAtMs: toMillis(creator?.timestamp || customer.createdAt),
        linkedStaffId: customer.assignedStaffId || '',
        linkedStaffName: getUserLabel(staffUser),
        linkedAgentId: customer.onboardedByAgent || '',
        linkedAgentName: getUserLabel(agentUser),
        linkedStaffDisplay: customer.assignedStaffId
          ? `${getUserLabel(staffUser)} (${customer.assignedStaffId})`
          : '—',
        linkedAgentDisplay: customer.onboardedByAgent
          ? `${getUserLabel(agentUser)} (${customer.onboardedByAgent})`
          : '—',
        referrerId: customer.referrerId || '',
        referrerRole: customer.referrerRole || '',
        referralRootId: customer.referralRootId || '',
        referralDepth: customer.referralDepth || 0,
        referralPath: normalizeReferralPath(customer.referralPath),
      };
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function selectStaffManagedCustomers(customers = [], staffId) {
  return dedupeById(customers)
    .map((customer) => {
      const scope = normalizeManagedCustomerScope(customer, staffId);
      return {
        ...customer,
        managementScope: scope.key,
        managementScopeLabel: scope.label,
      };
    })
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

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

export async function getReferralEligibleUsers() {
  const [agents, customers] = await Promise.all([
    getUsersByRole('agent'),
    getUsersByRole('customer'),
  ]);

  return [...agents, ...customers]
    .filter((user) => user.status === 'active' && user.customerStatus !== 'lead')
    .sort((a, b) => getUserLabel(a).localeCompare(getUserLabel(b)));
}

export async function getCustomerReferralChain(customerId) {
  const customer = await getUserById(customerId);
  if (!customer || customer.role !== 'customer') return null;

  const referralPath = normalizeReferralPath(customer.referralPath);
  const referrer = customer.referrerId
    ? referralPath.find((entry) => entry.id === customer.referrerId)
      || createUnknownSnapshot(customer.referrerId, customer.referrerRole || 'unknown')
    : null;

  return {
    customerId: customer.id || customer.uid,
    customerName: customer.displayName || customer.email || 'Unknown Customer',
    referrerId: customer.referrerId || '',
    referrerRole: customer.referrerRole || '',
    referralRootId: customer.referralRootId || '',
    referralDepth: customer.referralDepth || 0,
    referrer,
    referralPath,
  };
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

export async function getCustomersCreatedByStaff(staffId) {
  const snap = await getDocs(query(
    col,
    where('role', '==', 'customer'),
    where('createdBy', '==', staffId),
    orderBy('createdAt', 'desc')
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getManagedCustomersByStaff(staffId) {
  const [assignedCustomers, createdCustomers] = await Promise.all([
    getCustomersByStaff(staffId),
    getCustomersCreatedByStaff(staffId),
  ]);

  return selectStaffManagedCustomers(
    [...assignedCustomers, ...createdCustomers],
    staffId
  );
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
  const updateUserProfile = httpsCallable(functions, 'updateUserProfile');
  await updateUserProfile({
    targetUid: id,
    updates: data,
  });
}

export async function createUserByAdmin(payload) {
  return invokeCallable('createUserByAdmin', payload);
}

export async function setManagedUserPassword(targetUid, newPassword) {
  const setManagedPassword = httpsCallable(functions, 'setManagedUserPassword');
  await setManagedPassword({
    targetUid,
    newPassword,
  });
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
    creator: {
      id: agentUid,
      name: customerData.createdByName || customerData.creatorName || 'Unknown Agent',
      role: 'agent',
      timestamp: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  };

  await setDoc(docRef, leadData);

  return { id: docRef.id, ...leadData };
}
