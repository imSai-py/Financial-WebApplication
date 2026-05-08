import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut,
  sendPasswordResetEmail,
  browserSessionPersistence,
  setPersistence,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../config/firebase';
import { validators } from '../utils/validation';

const AuthContext = createContext(null);

/**
 * Auth resolution timeout.
 * If loading hasn't resolved in 10 seconds, we surface a network error
 * instead of leaving the user staring at a spinner forever (Edge Case B).
 */
const AUTH_TIMEOUT_MS = 10_000;

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [authError, setAuthError] = useState(null);

  /**
   * Cache ref: when login() fetches the profile, we store it here
   * so the subsequent onAuthStateChanged callback can reuse it
   * instead of making a redundant Firestore read.
   *
   * COST IMPACT: Reduces login from 2 Firestore reads → 1.
   */
  const loginProfileRef = useRef(null);

  /**
   * Tracks the UID of the currently active listener.
   * Prevents stale onSnapshot callbacks from setting state after
   * the user has already switched accounts or logged out.
   */
  const activeUidRef = useRef(null);

  /**
   * Set session persistence on mount.
   *
   * browserSessionPersistence: auth state is cleared when the browser
   * tab/window is closed. This is the recommended setting for financial
   * applications — forces re-login per session for tighter security.
   *
   * DECISION: Approved by architect in Phase 4 review.
   */
  useEffect(() => {
    setPersistence(auth, browserSessionPersistence).catch((err) => {
      console.error('Failed to set session persistence:', err);
    });
  }, []);

  /**
   * Network timeout guard (Edge Case B).
   *
   * If loading takes longer than AUTH_TIMEOUT_MS, the user's network
   * is likely down or Firestore is unreachable. Rather than showing
   * an infinite spinner, we surface a "Connection Issue" error UI
   * with a retry button.
   */
  useEffect(() => {
    if (!loading) return;

    const timer = setTimeout(() => {
      setAuthError('timeout');
      setAuthInitialized(true);
      setLoading(false);
    }, AUTH_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [loading]);

  /**
   * Hybrid role resolution:
   *   1. Read role from JWT custom claims (set by Cloud Functions)
   *   2. Fall back to Firestore document role field (legacy / pre-claims users)
   *
   * This ensures the system works for:
   *   - New users (custom claim set by onUserCreate Cloud Function)
   *   - Existing users (Firestore doc role read as fallback)
   *   - Recently role-changed users (after token refresh)
   */
  const resolveRole = useCallback(async (user, firestoreRole) => {
    try {
      const tokenResult = await user.getIdTokenResult();
      const claimsRole = tokenResult.claims?.role;

      // If custom claim exists, it's the source of truth (set by Admin SDK)
      if (claimsRole) {
        return claimsRole;
      }

      // Fallback to Firestore doc role (for users without claims yet)
      return firestoreRole || 'customer';
    } catch {
      // If claims fetch fails, use Firestore role
      return firestoreRole || 'customer';
    }
  }, []);

  const buildUserProfile = useCallback((authUser, docData = {}, resolvedRole) => ({
    ...docData,
    uid: authUser.uid,
    displayName: docData.displayName || authUser.displayName || '',
    email: Object.prototype.hasOwnProperty.call(docData, 'email')
      ? (docData.email || '')
      : (authUser.email || ''),
    role: resolvedRole,
  }), []);

  /**
   * Force refresh the user's JWT token to pick up updated custom claims.
   * Call this after a role change (e.g., admin changes someone's role).
   *
   * Returns the updated role string.
   */
  const refreshClaims = useCallback(async () => {
    if (!currentUser) return null;

    try {
      // Force token refresh — fetches latest claims from Firebase Auth
      await currentUser.getIdToken(true);
      const tokenResult = await currentUser.getIdTokenResult();
      const newRole = tokenResult.claims?.role;

      if (newRole && userProfile) {
        const updatedProfile = { ...userProfile, role: newRole };
        setUserProfile(updatedProfile);
        return newRole;
      }

      return userProfile?.role || null;
    } catch (err) {
      console.error('Failed to refresh claims:', err);
      return userProfile?.role || null;
    }
  }, [currentUser, userProfile]);

  /**
   * Auth state listener + real-time Firestore profile listener.
   *
   * KEY CHANGE (Phase 5): Switched from one-time `getDoc` to `onSnapshot`
   * for the user's profile document. This enables:
   *
   *   Edge Case A (Role Demotion Mid-Session):
   *     If an admin changes a user's role or suspends their account,
   *     the onSnapshot listener fires immediately, and the client-side
   *     state updates in real-time. No need to wait for token refresh.
   *
   *   Edge Case C (Suspended State):
   *     If a user's status changes to 'suspended' or 'deactivated',
   *     onSnapshot detects it and triggers an immediate signOut().
   *
   * The loginProfileRef cache optimization is preserved:
   *   - login() fetches profile → caches in loginProfileRef
   *   - onAuthStateChanged fires → uses cache for instant render
   *   - onSnapshot still attaches, but skips the 1st callback
   *     (the cache is fresher — fetched <100ms ago)
   *   - Subsequent onSnapshot callbacks handle live updates
   *
   * COST: onSnapshot = 1 doc read on attach + 1 per change (vs. 1 total with getDoc).
   * SECURITY: Instant role/status enforcement > marginal read cost.
   */
  useEffect(() => {
    let profileUnsub = null;

    const authUnsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);

      // Clean up previous user's profile listener
      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }

      if (user) {
        activeUidRef.current = user.uid;

        // ── Optimization: reuse profile from login() if available ──
        const cachedProfile = loginProfileRef.current;
        if (cachedProfile?.uid === user.uid) {
          setUserProfile(cachedProfile);
          loginProfileRef.current = null;
          setAuthInitialized(true);
          setLoading(false);
          setAuthError(null);
        }

        // ── Real-time listener for live updates ──
        // If cached: skip 1st callback (data is fresh from login())
        // If not cached: 1st callback provides initial data
        let isFirstCallback = !!cachedProfile;

        profileUnsub = onSnapshot(
          doc(db, 'users', user.uid),
          async (snap) => {
            // Guard: abort if user logged out while this callback was queued
            if (activeUidRef.current !== user.uid) return;

            // Skip 1st callback when we already used cached data
            if (isFirstCallback) {
              isFirstCallback = false;
              return;
            }

            if (snap.exists()) {
              const docData = snap.data();

              // ── Edge Case A + C: Block suspended/deactivated users ──
              // If an admin suspends this user mid-session, this fires
              // immediately via the real-time listener.
              if (docData.status === 'suspended' || docData.status === 'deactivated') {
                await signOut(auth);
                // signOut triggers onAuthStateChanged(null), which handles cleanup
                return;
              }

              // Hybrid role resolution: claims first, doc fallback
              const resolvedRole = await resolveRole(user, docData.role);

              // Guard again after async gap
              if (activeUidRef.current !== user.uid) return;

              setUserProfile(buildUserProfile(user, docData, resolvedRole));
            } else {
              setUserProfile(null);
            }

            setAuthInitialized(true);
            setLoading(false);
            setAuthError(null);
          },
          (error) => {
            console.error('Profile listener error:', error);
            // Only surface error if we don't have cached profile data
            if (!cachedProfile) {
              setAuthError('network');
            }
            setAuthInitialized(true);
            setLoading(false);
          }
        );
      } else {
        // User logged out
        activeUidRef.current = null;
        setUserProfile(null);
        setAuthInitialized(true);
        setLoading(false);
        setAuthError(null);
      }
    });

    return () => {
      authUnsub();
      if (profileUnsub) profileUnsub();
    };
  }, [buildUserProfile, resolveRole]);

  /**
   * Login with email & password.
   *
   * Flow:
   *   1. Firebase Auth → signInWithEmailAndPassword
   *   2. Firestore → getDoc (one-time read for immediate validation)
   *   3. Status gate → block suspended/deactivated
   *   4. Hybrid role resolution → claims or doc fallback
   *   5. Cache profile in loginProfileRef for onAuthStateChanged
   *
   * Returns the resolved profile object.
   */
  async function login(identifier, password) {
    const normalizedIdentifier = typeof identifier === 'string' ? identifier.trim() : '';
    const identifierError = validators.required(normalizedIdentifier, 'Email, username, or phone');
    if (identifierError) {
      const err = new Error(identifierError);
      err.code = 'auth/missing-identifier';
      throw err;
    }

    const passwordError = validators.required(password, 'Password');
    if (passwordError) {
      const err = new Error(passwordError);
      err.code = 'auth/missing-password';
      throw err;
    }

    setLoading(true);
    setAuthError(null);

    try {
      let authEmail = normalizedIdentifier;

      if (looksLikeEmail(normalizedIdentifier)) {
        authEmail = normalizeEmail(normalizedIdentifier);
      } else {
        const resolveCustomerLoginIdentifier = httpsCallable(functions, 'resolveCustomerLoginIdentifier');
        const response = await resolveCustomerLoginIdentifier({ identifier: normalizedIdentifier });
        authEmail = response.data?.authEmail;

        if (!authEmail) {
          const err = new Error('Invalid login credentials.');
          err.code = 'auth/invalid-login-identifier';
          throw err;
        }
      }

      const cred = await signInWithEmailAndPassword(auth, authEmail, password);
    
    // Force token refresh to pick up latest custom claims (e.g., after role change)
    await cred.user.getIdToken(true);
    
    const profileDoc = await getDoc(doc(db, 'users', cred.user.uid));
    if (!profileDoc.exists()) {
      await signOut(auth);
      throw new Error('User profile not found. Contact an administrator.');
    }

    const docData = profileDoc.data();

    // Block suspended / deactivated users at login
    if (docData.status === 'suspended' || docData.status === 'deactivated') {
      await signOut(auth);
      throw new Error(
        docData.status === 'suspended'
          ? 'Your account has been suspended. Contact an administrator.'
          : 'Your account has been deactivated. Contact an administrator.'
      );
    }

    // Hybrid role resolution at login
    const resolvedRole = await resolveRole(cred.user, docData.role);

    const profile = buildUserProfile(cred.user, docData, resolvedRole);

    // Prime auth state before route changes so protected routes do not
    // briefly evaluate against stale signed-out context.
    activeUidRef.current = cred.user.uid;
    setCurrentUser(cred.user);
    setUserProfile(profile);
    setAuthInitialized(true);
    setLoading(false);

    // ── Cache for onAuthStateChanged ──
    // Store the profile so the listener (which fires next) can skip
    // the redundant Firestore read. Saves 1 document read per login.
    loginProfileRef.current = profile;

      return profile;
    } catch (err) {
      loginProfileRef.current = null;

      if (!auth.currentUser) {
        activeUidRef.current = null;
        setCurrentUser(null);
      }

      setUserProfile(null);
      setAuthInitialized(true);
      setLoading(false);
      throw err;
    }
  }

  /**
   * Self-registration is LOCKED to 'customer' role.
   * Admin creates staff/agent/admin users via the admin panel.
   * The role field from userData is IGNORED to prevent privilege escalation.
   *
   * The onUserCreate Cloud Function also sets the 'customer' custom claim
   * automatically — belt-and-suspenders approach.
   */
  async function register() {
    throw new Error('Self-service registration is disabled. Contact your administrator, staff member, or agent.');
  }

  async function logout() {
    await signOut(auth);
    setCurrentUser(null);
    setUserProfile(null);
  }

  async function resetPassword(email) {
    await sendPasswordResetEmail(auth, email);
  }

  const value = {
    currentUser,
    userProfile,
    loading,
    authInitialized,
    authError,
    login,
    register,
    logout,
    resetPassword,
    refreshClaims,
    isAdmin: userProfile?.role === 'admin',
    isStaff: userProfile?.role === 'staff',
    isCustomer: userProfile?.role === 'customer',
    isAgent: userProfile?.role === 'agent',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
