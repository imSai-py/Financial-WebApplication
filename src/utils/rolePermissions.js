/**
 * Role-based permission matrix & helpers.
 * 
 * CLIENT-SIDE ONLY — for UI rendering decisions.
 * Real security is enforced by Firestore Security Rules + Custom Claims.
 * 
 * Permission values:
 *   true        = full access
 *   false       = no access
 *   'own'       = scoped to documents owned by the user
 *   'customers' = can only see customer-role users (staff)
 *   'onboarded' = can only see customers they onboarded (agent — Q4)
 *   'processed' = can only see records they processed (staff transactions)
 *   'assigned'  = can also see records for assigned customers (staff — Q2)
 *   'limited'   = restricted to specific subtypes (agent transactions — deposit/payment)
 */

// ═══════════════════════════════════════════════════════
// Core Permission Matrix
// ═══════════════════════════════════════════════════════

export const ROLE_PERMISSIONS = {
  admin: {
    users:        { create: true, read: true, update: true, delete: true, changeRole: true },
    transactions: { create: true, read: true, update: true, delete: false },
    tasks:        { create: true, read: true, update: true, delete: true, reassign: true },
    commissions:  { create: true, read: true, update: true, delete: false },
    activityLogs: { create: true, read: true, update: false, delete: false },
    settings:     { read: true, update: true },
  },
  staff: {
    users:        { create: false, read: 'customers', update: false, delete: false, changeRole: false },
    transactions: { create: true, read: 'assigned', update: true, delete: false },
    tasks:        { create: false, read: 'own', update: 'own', delete: false, reassign: false },
    commissions:  { create: false, read: false, update: false, delete: false },
    activityLogs: { create: true, read: false, update: false, delete: false },
    settings:     { read: true, update: true },
  },
  customer: {
    users:        { create: false, read: 'own', update: 'own', delete: false, changeRole: false },
    transactions: { create: 'own', read: 'own', update: false, delete: false },
    loans:        { create: false, read: 'own', update: false, delete: false },
    tasks:        { create: false, read: false, update: false, delete: false },
    commissions:  { create: false, read: false, update: false, delete: false },
    activityLogs: { create: true, read: false, update: false, delete: false },
    settings:     { read: true, update: true },
  },
  agent: {
    users:        { create: 'onboard', read: 'onboarded', update: 'own', delete: false, changeRole: false },
    transactions: { create: 'limited', read: 'own', update: false, delete: false },
    tasks:        { create: false, read: 'own', update: 'own', delete: false },
    commissions:  { create: false, read: 'own', update: false, delete: false },
    activityLogs: { create: true, read: false, update: false, delete: false },
    settings:     { read: true, update: true },
  },
};

// Agent-allowed transaction types
export const AGENT_ALLOWED_TX_TYPES = ['deposit', 'payment'];

// Customer-allowed transaction types (internal ledger — Phase 6.3)
export const CUSTOMER_ALLOWED_TX_TYPES = ['payment', 'transfer'];

// All valid transaction types
export const ALL_TX_TYPES = ['deposit', 'withdrawal', 'transfer', 'payment', 'refund'];

// ═══════════════════════════════════════════════════════
// Non-Sensitive Customer Fields (Q4 — Agent View)
// ═══════════════════════════════════════════════════════

/**
 * Fields visible to Agents when viewing onboarded customers.
 * Sensitive fields (address, status, role internals) are excluded.
 * 
 * NOTE: Firestore rules cannot do field-level read filtering.
 * The Agent CAN read the full doc (rules allow it for onboarded customers).
 * This array is used CLIENT-SIDE to filter what the UI renders.
 * Do NOT store truly secret data on the user doc — use subcollections for that.
 */
export const AGENT_VISIBLE_CUSTOMER_FIELDS = [
  'uid',
  'displayName',
  'email',
  'phone',
  'profileImage',
  'dateOfBirth',
  'panNumber',
  'kycStatus',
  'customerStatus',
  'createdAt',
];

/**
 * Fields that are always hidden from non-admin views.
 * Used for defensive UI filtering.
 */
export const SENSITIVE_FIELDS = [
  'status',
  'role',
  'address',
  'updatedAt',
  'onboardedByAgent',
  'assignedStaffId',
];

// ═══════════════════════════════════════════════════════
// Permission Check Helpers
// ═══════════════════════════════════════════════════════

/**
 * Check if a role has ANY access to a resource action.
 * Returns true for 'own', 'customers', 'processed', 'limited', 'onboarded', 'assigned'.
 */
export function canAccess(role, resource, action) {
  const perm = ROLE_PERMISSIONS[role]?.[resource]?.[action];
  return perm !== false && perm !== undefined;
}

/**
 * Get the raw permission value (true, false, 'own', 'customers', etc.)
 */
export function getPermission(role, resource, action) {
  return ROLE_PERMISSIONS[role]?.[resource]?.[action] ?? false;
}

/**
 * Check if permission is scoped (not full access).
 * Returns true for 'own', 'customers', 'processed', 'limited', 'onboarded', 'assigned'.
 */
export function isScopedAccess(role, resource, action) {
  const perm = getPermission(role, resource, action);
  return typeof perm === 'string';
}

/**
 * Get transaction types allowed for a role.
 */
export function getAllowedTransactionTypes(role) {
  if (role === 'agent') return AGENT_ALLOWED_TX_TYPES;
  if (role === 'customer') return CUSTOMER_ALLOWED_TX_TYPES;
  if (role === 'admin' || role === 'staff') return ALL_TX_TYPES;
  return [];
}

/**
 * Filter a customer profile object to only include non-sensitive fields.
 * Used when Agents view onboarded customers (Q4).
 */
export function filterCustomerForAgent(customerData) {
  if (!customerData) return null;
  const filtered = {};
  for (const field of AGENT_VISIBLE_CUSTOMER_FIELDS) {
    if (customerData[field] !== undefined) {
      filtered[field] = customerData[field];
    }
  }
  return filtered;
}

// ═══════════════════════════════════════════════════════
// Navigation Items
// ═══════════════════════════════════════════════════════

export function getNavItems(role) {
  const items = [
    { label: 'Dashboard',     path: '/dashboard',     icon: 'LayoutDashboard', roles: ['admin', 'staff', 'customer', 'agent'] },
    { label: 'Manage Users',  path: '/users',          icon: 'UserCog',         roles: ['admin'] },
    { label: 'My Portfolio',  path: '/portfolio',      icon: 'Briefcase',       roles: ['agent'] },
    { label: 'Customers',     path: '/customers',     icon: 'Users',           roles: ['admin', 'staff'] },
    { label: 'Transactions',  path: '/transactions',  icon: 'ArrowLeftRight',  roles: ['admin', 'staff', 'customer', 'agent'] },
    { label: 'My Loans',      path: '/loans',          icon: 'Landmark',        roles: ['customer'] },
    { label: 'Tasks',         path: '/tasks',          icon: 'CheckSquare',     roles: ['admin', 'staff', 'agent'] },
    { label: 'Commissions',   path: '/commissions',    icon: 'IndianRupee',     roles: ['admin', 'agent'] },
    { label: 'Reports',       path: '/reports',        icon: 'BarChart3',       roles: ['admin', 'staff'] },
    { label: 'Activity Logs', path: '/activity',       icon: 'ScrollText',      roles: ['admin'] },
    { label: 'Settings',      path: '/settings',       icon: 'Settings',        roles: ['admin', 'staff', 'customer', 'agent'] },
  ];
  return items.filter(item => item.roles.includes(role));
}
