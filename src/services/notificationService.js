import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  writeBatch,
  getDocs,
  where
} from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Get collection reference for a user's notifications
 */
const getNotifCol = (userId) => collection(db, 'users', userId, 'notifications');

/**
 * Subscribe to a user's notifications in real-time.
 * Calls the callback with (notificationsArray, unreadCount)
 */
export function subscribeToNotifications(userId, callback) {
  if (!userId) return () => {};

  const q = query(getNotifCol(userId), orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    const unreadCount = notifications.filter(n => !n.isRead).length;
    callback(notifications, unreadCount);
  }, (error) => {
    console.error("Error subscribing to notifications:", error);
  });
}

/**
 * Create a new notification for a specific user
 * Payload expects: { title, message, type (info, success, warning), link (optional) }
 */
export async function createNotification(userId, payload) {
  if (!userId) throw new Error("userId required implicitly for notifications");
  
  await addDoc(getNotifCol(userId), {
    ...payload,
    isRead: false,
    createdAt: serverTimestamp()
  });
}

/**
 * Mark a single notification as read
 */
export async function markAsRead(userId, notificationId) {
  const notifRef = doc(db, 'users', userId, 'notifications', notificationId);
  await updateDoc(notifRef, { isRead: true });
}

/**
 * Mark all unread notifications as read
 */
export async function markAllAsRead(userId) {
  const q = query(getNotifCol(userId), where('isRead', '==', false));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) return;

  const batch = writeBatch(db);
  snapshot.docs.forEach((document) => {
    batch.update(document.ref, { isRead: true });
  });

  await batch.commit();
}
