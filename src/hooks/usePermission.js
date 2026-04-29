import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { canAccess, getPermission, isScopedAccess, getAllowedTransactionTypes } from '../utils/rolePermissions';

/**
 * Hook providing role-aware permission checks for the current user.
 * 
 * Usage:
 *   const { can, permission, isScoped, allowedTxTypes } = usePermission();
 *   
 *   if (can('transactions', 'create')) { ... }
 *   if (permission('users', 'read') === 'own') { ... }
 */
export function usePermission() {
  const { userProfile } = useAuth();
  const role = userProfile?.role;

  return useMemo(() => ({
    /** Boolean: can the user access this resource+action at all? */
    can: (resource, action) => canAccess(role, resource, action),

    /** Raw permission value: true, false, 'own', 'processed', 'limited', 'customers' */
    permission: (resource, action) => getPermission(role, resource, action),

    /** Boolean: is access scoped (not full)? */
    isScoped: (resource, action) => isScopedAccess(role, resource, action),

    /** Transaction types this role can create */
    allowedTxTypes: getAllowedTransactionTypes(role),

    /** Current role string */
    role,
  }), [role]);
}
