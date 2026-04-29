import { 
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';

const COLLECTION = 'tasks';
const col = collection(db, COLLECTION);

/**
 * Get tasks scoped by role.
 * - Admin: all tasks
 * - Staff/Agent: only tasks assigned to them
 * - Customer: no access
 */
export async function getTasks(userProfile) {
  const role = userProfile?.role;
  const uid = userProfile?.uid;

  if (role === 'customer') return [];

  let q;
  if (role === 'admin') {
    q = query(col, orderBy('createdAt', 'desc'));
  } else {
    // Staff and Agent see only their assigned tasks
    q = query(col, where('assignedTo', '==', uid), orderBy('createdAt', 'desc'));
  }

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getTasksByAssignee(assigneeId) {
  const snap = await getDocs(query(
    col,
    where('assignedTo', '==', assigneeId),
    orderBy('createdAt', 'desc')
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getTaskById(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

import { createNotification } from './notificationService';

/**
 * Create a task — Admin only.
 * Sets createdBy to the creating admin's UID (rules enforce this).
 */
export async function createTask(data, userProfile) {
  const taskData = {
    ...data,
    createdBy: userProfile.uid,
    status: data.status || 'pending',
    priority: data.priority || 'medium',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(col, taskData);
  
  // Trigger notification for the assignee if it's not the creator
  if (data.assignedTo && data.assignedTo !== userProfile.uid) {
    try {
      await createNotification(data.assignedTo, {
        title: 'New Task Assigned',
        message: `You have been assigned a new task: ${data.title}`,
        type: 'info',
        link: '/tasks'
      });
    } catch (error) {
      console.error("Failed to send notification:", error);
    }
  }
  
  return { id: ref.id, ...taskData };
}

/**
 * Update a task.
 * Staff/Agent can only update status of their own tasks (rules enforce this).
 */
export async function updateTask(id, data) {
  await updateDoc(doc(db, COLLECTION, id), { ...data, updatedAt: serverTimestamp() });
}

/**
 * Delete a task — Admin only (rules enforce this).
 */
export async function deleteTask(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

/**
 * Get tasks for a specific assignee filtered by status.
 * Uses composite index: assignedTo + status + createdAt.
 *
 * @param {string} assigneeId - The UID of the staff/agent
 * @param {string} status - Task status to filter: 'pending', 'in_progress', 'completed', 'cancelled'
 * @returns {Array} Matching tasks sorted by creation date (newest first)
 */
export async function getTasksByStatus(assigneeId, status) {
  const snap = await getDocs(query(
    col,
    where('assignedTo', '==', assigneeId),
    where('status', '==', status),
    orderBy('createdAt', 'desc')
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
