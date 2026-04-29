import { usePermission } from '../../hooks/usePermission';

/**
 * Declarative permission gate component.
 * 
 * Renders children only if the current user has the specified permission.
 * Optionally renders a fallback if unauthorized.
 * 
 * Usage:
 *   <Can perform="transactions.create">
 *     <button>New Transaction</button>
 *   </Can>
 * 
 *   <Can perform="users.delete" fallback={<span>No access</span>}>
 *     <button>Delete User</button>
 *   </Can>
 * 
 *   <Can perform="commissions.read" role="admin">
 *     <CommissionsTable />
 *   </Can>
 */
export default function Can({ perform, fallback = null, children }) {
  const { can } = usePermission();

  if (!perform || typeof perform !== 'string') {
    console.warn('Can: "perform" prop must be a string like "resource.action"');
    return fallback;
  }

  const [resource, action] = perform.split('.');

  if (!resource || !action) {
    console.warn(`Can: Invalid "perform" format: "${perform}". Use "resource.action" format.`);
    return fallback;
  }

  return can(resource, action) ? children : fallback;
}
