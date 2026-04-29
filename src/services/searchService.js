import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Searches users by email prefix.
 * Note: Firestore is case-sensitive, so we assume lowercase search for email.
 */
async function searchUsers(searchTerm) {
  const termLower = searchTerm.toLowerCase();
  const q = query(
    collection(db, 'users'),
    where('email', '>=', termLower),
    where('email', '<=', termLower + '\uf8ff'),
    limit(5)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({
    type: 'user',
    id: doc.id,
    title: doc.data().displayName || doc.data().email,
    subtitle: doc.data().role,
    route: '/users'
  }));
}

/**
 * Searches tasks by status or strict title match.
 * Since Firestore lacks full-text search, we do a basic prefix check on title.
 */
async function searchTasks(searchTerm) {
  // Try to match uppercase/capitalized prefixes for task titles if needed
  // For safety, we just fetch recent tasks and filter client side if the db is small,
  // but prefix matching is more scalable.
  const termCapitalized = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1);
  
  const q = query(
    collection(db, 'tasks'),
    where('title', '>=', termCapitalized),
    where('title', '<=', termCapitalized + '\uf8ff'),
    limit(5)
  );

  const snap = await getDocs(q);
  return snap.docs.map(doc => ({
    type: 'task',
    id: doc.id,
    title: doc.data().title,
    subtitle: `Status: ${doc.data().status}`,
    route: '/tasks'
  }));
}

/**
 * Performs global search across collections using prefix queries.
 * @param {string} searchTerm 
 * @returns {Array} List of formatted results
 */
export async function globalSearch(searchTerm) {
  if (!searchTerm || searchTerm.trim().length < 2) return [];
  
  try {
    const [users, tasks] = await Promise.all([
      searchUsers(searchTerm),
      searchTasks(searchTerm)
    ]);
    
    // Aggregate and interleave results
    return [...users, ...tasks];
  } catch (error) {
    console.warn("Search index warning or query failed:", error.message);
    return [];
  }
}
