import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

const SETTINGS_DOC = doc(db, 'appSettings', 'global');

/**
 * Default settings — used when no settings doc exists yet.
 * Admin sees these as initial values on first load.
 */
const DEFAULT_SETTINGS = {
  // Branding
  appName: 'FinanceFlow',
  currency: 'INR',
  currencySymbol: '₹',
  timezone: 'Asia/Kolkata',

  // Financial Defaults
  defaultCommissionRate: 5,
  maxCommissionRate: 15,
  minTransactionAmount: 100,
  maxTransactionAmount: 10000000,
  autoApprovalThreshold: 50000,

  // Operational Guardrails
  maintenanceMode: false,
  allowNewRegistrations: true,
  requireKycForTransactions: false,
  maxLeadAgeDays: 90,
};

/**
 * Get app settings — returns defaults merged with Firestore values.
 */
export async function getSettings() {
  try {
    const snap = await getDoc(SETTINGS_DOC);
    if (snap.exists()) {
      return { ...DEFAULT_SETTINGS, ...snap.data() };
    }
    return { ...DEFAULT_SETTINGS };
  } catch (err) {
    console.error('Failed to load settings:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save settings — creates or updates the appSettings/global doc.
 * @param {Object} settings - The settings to save
 * @param {string} adminUid - The UID of the admin making the change
 */
export async function saveSettings(settings, adminUid) {
  const data = {
    ...settings,
    updatedAt: serverTimestamp(),
    updatedBy: adminUid,
  };

  const snap = await getDoc(SETTINGS_DOC);
  if (snap.exists()) {
    await updateDoc(SETTINGS_DOC, data);
  } else {
    data.createdAt = serverTimestamp();
    await setDoc(SETTINGS_DOC, data);
  }
}

/**
 * Subscribe to app settings in real-time.
 * @param {Function} callback - Triggered when settings change.
 * @returns {Function} Unsubscribe function.
 */
export function subscribeToSettings(callback) {
  return onSnapshot(SETTINGS_DOC, (docSnap) => {
    if (docSnap.exists()) {
      callback({ ...DEFAULT_SETTINGS, ...docSnap.data() });
    } else {
      callback({ ...DEFAULT_SETTINGS });
    }
  }, (err) => {
    console.error('Settings subscription error:', err);
    callback({ ...DEFAULT_SETTINGS });
  });
}

export { DEFAULT_SETTINGS };
