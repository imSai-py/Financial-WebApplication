/**
 * FinanceFlow — Cloud Functions for RBAC (Hybrid Custom Claims)
 *
 * Functions:
 *   1. setUserRole      — Admin-only callable: sets custom claim + updates Firestore doc
 *   2. onUserCreate     — Auth trigger: auto-assigns 'customer' claim on registration
 *   3. onRoleFieldChange — Firestore trigger: syncs doc role → custom claim (hybrid fallback)
 *
 * Security model:
 *   - Custom claims are the PRIMARY source of truth for Firestore Rules
 *   - Firestore doc role field is the SECONDARY source (hybrid fallback)
 *   - Only these functions can modify custom claims (admin SDK privilege)
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { beforeUserCreated } = require("firebase-functions/v2/identity");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const app = initializeApp();
const auth = getAuth(app);
const db = getFirestore(app);

// ═══════════════════════════════════════════════════════
// Valid roles enum — single source of truth
// ═══════════════════════════════════════════════════════
const VALID_ROLES = ["admin", "staff", "customer", "agent"];
const REFERRAL_ELIGIBLE_ROLES = ["agent", "customer"];
const DEFAULT_REFERRAL_LEVELS = [500, 250, 125, 75, 50];
const MAX_REFERRAL_DEPTH = 5;
const AUTH_IDENTIFIER_COLLECTION = "authIdentifiers";
const SYNTHETIC_EMAIL_DOMAIN = "customers.financeflow.local";
const ALLOWED_KYC_STATUSES = ["not_submitted", "pending", "verified", "rejected"];

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function normalizeOptionalEmail(email) {
  if (!email || typeof email !== "string" || !email.trim()) return "";
  return normalizeEmail(email);
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeUsername(username) {
  if (!username || typeof username !== "string") return "";
  return username.trim().toLowerCase();
}

function validateUsername(username) {
  if (!username || typeof username !== "string" || !username.trim()) {
    return "Username is required.";
  }

  const normalized = username.trim();
  if (normalized.length < 4) {
    return "Username must be at least 4 characters long.";
  }
  if (normalized.length > 30) {
    return "Username must be 30 characters or fewer.";
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) {
    return "Username can only contain letters, numbers, dots, underscores, and hyphens.";
  }

  return null;
}

function normalizePhone(phone) {
  if (!phone || typeof phone !== "string") return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  return digits;
}

function validatePhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  if (!/^[6-9]\d{9}$/.test(normalized)) {
    return "Invalid phone number.";
  }
  return null;
}

function buildSyntheticAuthEmail(uid) {
  return `customer.${uid.toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

function buildAuthIdentifierDocId(kind, normalizedValue) {
  return `${kind}:${normalizedValue}`;
}

function buildAuthIdentifierDoc(kind, normalizedValue, { userId, authEmail, role }) {
  return {
    kind,
    normalizedValue,
    userId,
    authEmail,
    role,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function getCustomerIdentifierEntries(data = {}, userId) {
  if (data.role !== "customer" || data.hasAuthAccount !== true) {
    return [];
  }

  const entries = [];
  if (data.email) {
    const normalizedEmail = normalizeOptionalEmail(data.email);
    if (normalizedEmail) {
      entries.push(["email", normalizedEmail]);
    }
  }

  const normalizedUsername = data.normalizedUsername || normalizeUsername(data.username);
  if (normalizedUsername) {
    entries.push(["username", normalizedUsername]);
  }

  const normalizedPhone = normalizePhone(data.phone || "");
  if (normalizedPhone) {
    entries.push(["phone", normalizedPhone]);
  }

  return entries.map(([kind, normalizedValue]) => ({
    kind,
    normalizedValue,
    docId: buildAuthIdentifierDocId(kind, normalizedValue),
    doc: buildAuthIdentifierDoc(kind, normalizedValue, {
      userId,
      authEmail: data.authEmail,
      role: data.role,
    }),
  }));
}

async function syncCustomerAuthIdentifiers({ userId, beforeData = null, afterData = null }) {
  const beforeEntries = getCustomerIdentifierEntries(beforeData || {}, userId);
  const afterEntries = getCustomerIdentifierEntries(afterData || {}, userId);

  const beforeMap = new Map(beforeEntries.map((entry) => [entry.docId, entry]));
  const afterMap = new Map(afterEntries.map((entry) => [entry.docId, entry]));
  const batch = db.batch();

  beforeMap.forEach((entry, docId) => {
    if (!afterMap.has(docId)) {
      batch.delete(db.collection(AUTH_IDENTIFIER_COLLECTION).doc(docId));
    }
  });

  afterMap.forEach((entry, docId) => {
    batch.set(
      db.collection(AUTH_IDENTIFIER_COLLECTION).doc(docId),
      entry.doc,
      { merge: true }
    );
  });

  await batch.commit();
}

function sanitizeAddress(address = {}) {
  return {
    street: typeof address?.street === "string" ? address.street.trim() : "",
    city: typeof address?.city === "string" ? address.city.trim() : "",
    state: typeof address?.state === "string" ? address.state.trim() : "",
    zip: typeof address?.zip === "string" ? address.zip.trim() : "",
  };
}

function validatePassword(password) {
  if (!password || typeof password !== "string") {
    return "Password is required.";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include at least one number.";
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(password)) {
    return "Password must include at least one special character.";
  }
  return null;
}

function normalizeReferralPath(path = []) {
  if (!Array.isArray(path)) return [];

  const seen = new Set();
  return path.reduce((entries, entry) => {
    if (!entry?.id || seen.has(entry.id)) return entries;
    seen.add(entry.id);
    entries.push({
      id: entry.id,
      name: entry.name || "Unknown",
      role: entry.role || "unknown",
    });
    return entries;
  }, []);
}

function buildReferralEntry(snapshot) {
  return {
    id: snapshot.id,
    name: snapshot.name || "Unknown",
    role: snapshot.role || "unknown",
  };
}

async function getReferralCommissionSettings() {
  const settingsDoc = await db.collection("appSettings").doc("global").get();
  const data = settingsDoc.exists ? settingsDoc.data() : {};
  const configuredLevels = Array.isArray(data.referralCommissionLevels)
    ? data.referralCommissionLevels.slice(0, MAX_REFERRAL_DEPTH)
    : DEFAULT_REFERRAL_LEVELS;

  return {
    referralCommissionEnabled: data.referralCommissionEnabled !== false,
    referralCommissionLevels: configuredLevels.map((value, index) => {
      const numeric = Number(value);
      const fallback = DEFAULT_REFERRAL_LEVELS[index] || 0;
      return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : fallback;
    }),
    maxReferralCommissionDepth: Math.min(
      Number(data.maxReferralCommissionDepth) || MAX_REFERRAL_DEPTH,
      MAX_REFERRAL_DEPTH
    ),
  };
}

function validateReferralPath(path = []) {
  const ids = path.map((entry) => entry.id);
  return new Set(ids).size === ids.length;
}

async function resolveReferralContext(referrerId, callerSnapshot) {
  if (!referrerId) {
    return {
      directReferrer: null,
      referralPath: [],
      referralRootId: "",
      referralDepth: 0,
    };
  }

  const referrerSnapshot = await getUserProfileSnapshot(referrerId);
  if (!referrerSnapshot || !REFERRAL_ELIGIBLE_ROLES.includes(referrerSnapshot.role)) {
    throw new HttpsError(
      "invalid-argument",
      "Direct referrer must be an active agent or customer."
    );
  }

  const referrerDoc = await db.collection("users").doc(referrerId).get();
  if (!referrerDoc.exists) {
    throw new HttpsError("not-found", "Direct referrer not found.");
  }

  const referrerData = referrerDoc.data();
  const inheritedPath = normalizeReferralPath(referrerData.referralPath || []);
  const directReferrerEntry = buildReferralEntry(referrerSnapshot);
  const referralPath = [directReferrerEntry, ...inheritedPath].slice(0, MAX_REFERRAL_DEPTH);

  if (!validateReferralPath(referralPath)) {
    throw new HttpsError(
      "failed-precondition",
      "Circular referral chain detected for the selected referrer."
    );
  }

  return {
    directReferrer: directReferrerEntry,
    referralPath,
    referralRootId: referralPath[referralPath.length - 1]?.id || directReferrerEntry.id,
    referralDepth: referralPath.length,
  };
}

function mapCreateUserError(error) {
  if (error instanceof HttpsError) {
    return error;
  }

  switch (error?.code) {
    case "auth/email-already-exists":
      return new HttpsError(
        "already-exists",
        "A user with this email already exists."
      );
    case "auth/invalid-password":
    case "auth/password-does-not-meet-requirements":
      return new HttpsError(
        "invalid-argument",
        error.message || "Password does not meet the required policy."
      );
    case "auth/invalid-email":
      return new HttpsError("invalid-argument", "Valid email is required.");
    default:
      return new HttpsError("internal", error?.message || "Failed to create user.");
  }
}

async function resolveCallerRole(request) {
  const callerUid = request.auth?.uid;
  let callerRole = request.auth?.token?.role;

  if (!callerRole) {
    const callerDoc = await db.collection("users").doc(callerUid).get();
    if (!callerDoc.exists) {
      throw new HttpsError("not-found", "Caller profile not found.");
    }
    callerRole = callerDoc.data().role;
  }

  return callerRole;
}

async function getUserProfileSnapshot(userId, fallbackRole = null) {
  if (!userId) return null;

  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) {
    return {
      id: userId,
      name: "Unknown",
      role: fallbackRole || "unknown",
    };
  }

  const data = userDoc.data();
  return {
    id: userId,
    name: data.displayName || data.email || "Unknown",
    role: data.role || fallbackRole || "unknown",
  };
}

async function resolveCallerIdentity(request) {
  const callerUid = request.auth?.uid;
  const callerSnapshot = await getUserProfileSnapshot(
    callerUid,
    request.auth?.token?.role || null
  );

  if (!callerSnapshot) {
    throw new HttpsError("not-found", "Caller profile not found.");
  }

  return callerSnapshot;
}

function buildCreatorSnapshot(snapshot) {
  return {
    id: snapshot.id,
    name: snapshot.name || "Unknown",
    role: snapshot.role || "unknown",
    timestamp: FieldValue.serverTimestamp(),
  };
}

async function writeActivityLog({
  userId,
  action,
  details = "",
  targetType = "",
  targetId = "",
  metadata = {},
}) {
  await db.collection("activityLogs").add({
    userId,
    action,
    details,
    targetType,
    targetId,
    metadata: {
      ...metadata,
      details,
      targetType,
      targetId,
    },
    timestamp: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function synthesizeLegacyCreator(existingData, callerSnapshot) {
  if (existingData?.creator?.id) {
    return existingData.creator;
  }

  if (existingData?.createdBy) {
    let inferredRole = null;
    if (existingData.createdBy === existingData.onboardedByAgent) {
      inferredRole = "agent";
    } else if (existingData.createdBy === existingData.assignedStaffId) {
      inferredRole = "staff";
    }

    const creatorSnapshot = await getUserProfileSnapshot(
      existingData.createdBy,
      inferredRole
    );

    return {
      ...creatorSnapshot,
      timestamp: existingData.createdAt || FieldValue.serverTimestamp(),
    };
  }

  if (existingData?.onboardedByAgent) {
    const creatorSnapshot = await getUserProfileSnapshot(
      existingData.onboardedByAgent,
      "agent"
    );
    return {
      ...creatorSnapshot,
      timestamp: existingData.createdAt || FieldValue.serverTimestamp(),
    };
  }

  if (existingData?.assignedStaffId) {
    const creatorSnapshot = await getUserProfileSnapshot(
      existingData.assignedStaffId,
      "staff"
    );
    return {
      ...creatorSnapshot,
      timestamp: existingData.createdAt || FieldValue.serverTimestamp(),
    };
  }

  return buildCreatorSnapshot(callerSnapshot);
}

function buildReferralCommissionDocId({ sourceCustomerId, beneficiaryId, level }) {
  return `referral-${sourceCustomerId}-${beneficiaryId}-L${level}`;
}

async function queueReferralCommissions({
  transaction,
  sourceCustomerId,
  directReferrerId = "",
  referralPath = [],
  sourceCustomerName = "",
  settings,
}) {
  const maxDepth = Math.min(
    settings.maxReferralCommissionDepth || MAX_REFERRAL_DEPTH,
    MAX_REFERRAL_DEPTH
  );

  const commissionEntries = [];

  for (let index = 0; index < Math.min(referralPath.length, maxDepth); index += 1) {
    const beneficiary = referralPath[index];
    if (!beneficiary?.id || !REFERRAL_ELIGIBLE_ROLES.includes(beneficiary.role)) {
      continue;
    }

    const level = index + 1;
    const amount = settings.referralCommissionLevels[index] || 0;
    if (amount <= 0) continue;

    const commissionId = buildReferralCommissionDocId({
      sourceCustomerId,
      beneficiaryId: beneficiary.id,
      level,
    });
    commissionEntries.push({
      commissionId,
      level,
      beneficiary,
      amount,
      chainSnapshot: referralPath.slice(0, level).map((entry) => ({
        id: entry.id,
        name: entry.name || "Unknown",
        role: entry.role || "unknown",
      })),
    });
  }

  const existingDocs = await Promise.all(
    commissionEntries.map(({ commissionId }) =>
      transaction.get(db.collection("commissions").doc(commissionId))
    )
  );

  commissionEntries.forEach((entry, index) => {
    if (existingDocs[index].exists) {
      return;
    }

    const commissionRef = db.collection("commissions").doc(entry.commissionId);
    transaction.set(commissionRef, {
      beneficiaryId: entry.beneficiary.id,
      beneficiaryRole: entry.beneficiary.role,
      agentId: entry.beneficiary.role === "agent" ? entry.beneficiary.id : "",
      sourceCustomerId,
      customerId: sourceCustomerId,
      directReferrerId: directReferrerId || "",
      level: entry.level,
      amount: entry.amount,
      rate: 0,
      status: "pending",
      type: "customer_referral_commission",
      description: `Referral commission for customer ${sourceCustomerName || sourceCustomerId} at level ${entry.level}`,
      eventKey: entry.commissionId,
      chainSnapshot: entry.chainSnapshot,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

// ═══════════════════════════════════════════════════════
// 1. setUserRole — Admin-Only Callable Function
// ═══════════════════════════════════════════════════════
//
// Called from the admin panel when changing a user's role.
// Sets the custom claim AND updates the Firestore doc atomically.
//
// Input:  { targetUid: string, newRole: string }
// Output: { success: true, message: string }
//
exports.setUserRole = onCall(
  {
    region: "us-central1",
    // TODO [PHASE 2 — Security Hardening]: Flip to `true` before production.
    // Requires registering app with reCAPTCHA Enterprise in Firebase Console.
    // Prevents unauthenticated API abuse of this admin-only Cloud Function.
    // See: https://firebase.google.com/docs/app-check
    enforceAppCheck: false,
  },
  async (request) => {
    // ── Gate 1: Must be authenticated ──
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    // ── Gate 2: Must be an admin (check custom claim first, then doc fallback) ──
    const callerUid = request.auth.uid;
    let callerRole = request.auth.token.role;

    // Hybrid fallback: if no custom claim yet, read from Firestore doc
    if (!callerRole) {
      const callerDoc = await db.collection("users").doc(callerUid).get();
      if (!callerDoc.exists) {
        throw new HttpsError("not-found", "Caller profile not found.");
      }
      callerRole = callerDoc.data().role;
    }

    if (callerRole !== "admin") {
      throw new HttpsError(
        "permission-denied",
        "Only admins can change user roles."
      );
    }

    // ── Gate 3: Validate input ──
    const { targetUid, newRole } = request.data;

    if (!targetUid || typeof targetUid !== "string") {
      throw new HttpsError("invalid-argument", "targetUid is required.");
    }

    if (!newRole || !VALID_ROLES.includes(newRole)) {
      throw new HttpsError(
        "invalid-argument",
        `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`
      );
    }

    // ── Gate 4: Prevent admin self-demotion ──
    if (callerUid === targetUid && newRole !== "admin") {
      throw new HttpsError(
        "failed-precondition",
        "Admins cannot demote themselves."
      );
    }

    // ── Gate 5: Verify target user exists ──
    const targetDoc = await db.collection("users").doc(targetUid).get();
    if (!targetDoc.exists) {
      throw new HttpsError("not-found", "Target user not found.");
    }

    const previousRole = targetDoc.data().role;

    try {
      // Set Firebase Auth custom claim
      await auth.setCustomUserClaims(targetUid, { role: newRole });

      // Update Firestore document
      await db.collection("users").doc(targetUid).update({
        role: newRole,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Log the role change in activity logs
      await writeActivityLog({
        userId: callerUid,
        action: "role_change",
        details: `Changed role of user ${targetUid} from '${previousRole}' to '${newRole}'`,
        targetType: "user",
        targetId: targetUid,
        metadata: {
          previousRole,
          newRole,
          type: "role_change",
        },
      });

      return {
        success: true,
        message: `Role updated: ${previousRole} → ${newRole}`,
      };
    } catch (error) {
      console.error("setUserRole error:", error);
      throw new HttpsError("internal", "Failed to update user role.");
    }
  }
);

// ═══════════════════════════════════════════════════════
// 2. onUserCreate — Auto-assign 'customer' claim
// ═══════════════════════════════════════════════════════
//
// Triggered when a new Firebase Auth user is created.
// Sets the 'customer' role custom claim automatically.
// This ensures the hybrid model works even for brand-new users.
//
exports.onUserCreate = beforeUserCreated(
  { region: "us-central1" },
  async (event) => {
    // Set custom claim for the new user to 'customer'
    // The beforeUserCreated blocking function can set custom claims
    // via the response object
    return {
      customClaims: {
        role: "customer",
      },
    };
  }
);

// ═══════════════════════════════════════════════════════
// 3. onRoleFieldChange — Firestore → Custom Claims sync
// ═══════════════════════════════════════════════════════
//
// Hybrid fallback: if someone (admin) updates the role field directly
// in Firestore (via the existing admin panel), sync it to custom claims.
// This ensures the hybrid model stays consistent even if setUserRole
// isn't called directly.
//
exports.onRoleFieldChange = onDocumentUpdated(
  {
    document: "users/{userId}",
    region: "us-central1",
  },
  async (event) => {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    const userId = event.params.userId;

    // Only fire if the role field actually changed
    if (beforeData.role === afterData.role) {
      return null;
    }

    const newRole = afterData.role;

    // Validate the new role
    if (!VALID_ROLES.includes(newRole)) {
      console.error(
        `Invalid role '${newRole}' detected on user ${userId}. Skipping claim sync.`
      );
      return null;
    }

    try {
      // Sync custom claim to match the Firestore doc
      await auth.setCustomUserClaims(userId, { role: newRole });
      console.log(
        `Synced custom claim for ${userId}: ${beforeData.role} → ${newRole}`
      );
      return null;
    } catch (error) {
      console.error(`Failed to sync claim for ${userId}:`, error);
      return null;
    }
  }
);

exports.onCustomerAuthIdentityChange = onDocumentUpdated(
  {
    document: "users/{userId}",
    region: "us-central1",
  },
  async (event) => {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    const userId = event.params.userId;
    const authIdentityChanged =
      beforeData.email !== afterData.email
      || beforeData.phone !== afterData.phone
      || beforeData.username !== afterData.username
      || beforeData.normalizedUsername !== afterData.normalizedUsername
      || beforeData.authEmail !== afterData.authEmail
      || beforeData.hasAuthAccount !== afterData.hasAuthAccount
      || beforeData.role !== afterData.role;

    if (!authIdentityChanged) {
      return null;
    }

    try {
      await syncCustomerAuthIdentifiers({ userId, beforeData, afterData });
      return null;
    } catch (error) {
      console.error(`Failed to sync auth identifiers for ${userId}:`, error);
      return null;
    }
  }
);

exports.resolveCustomerLoginIdentifier = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    const rawIdentifier = request.data?.identifier;
    if (!rawIdentifier || typeof rawIdentifier !== "string" || !rawIdentifier.trim()) {
      throw new HttpsError("invalid-argument", "Login identifier is required.");
    }

    const normalizedInput = rawIdentifier.trim();
    if (looksLikeEmail(normalizedInput)) {
      return {
        authEmail: normalizeEmail(normalizedInput),
        identifierType: "email",
      };
    }

    const normalizedUsername = normalizeUsername(normalizedInput);
    const usernameDoc = await db
      .collection(AUTH_IDENTIFIER_COLLECTION)
      .doc(buildAuthIdentifierDocId("username", normalizedUsername))
      .get();

    if (usernameDoc.exists) {
      return {
        authEmail: usernameDoc.data().authEmail,
        identifierType: "username",
      };
    }

    const normalizedPhone = normalizePhone(normalizedInput);
    if (normalizedPhone) {
      const phoneDoc = await db
        .collection(AUTH_IDENTIFIER_COLLECTION)
        .doc(buildAuthIdentifierDocId("phone", normalizedPhone))
        .get();

      if (phoneDoc.exists) {
        return {
          authEmail: phoneDoc.data().authEmail,
          identifierType: "phone",
        };
      }
    }

    throw new HttpsError("not-found", "No customer account found for that login identifier.");
  }
);

exports.updateUserProfile = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign-in required.");
    }

    const callerUid = request.auth.uid;
    const callerRole = await resolveCallerRole(request);
    const targetUid = request.data?.targetUid;
    const rawUpdates = request.data?.updates;

    if (!targetUid || typeof targetUid !== "string") {
      throw new HttpsError("invalid-argument", "Target user id is required.");
    }
    if (!rawUpdates || typeof rawUpdates !== "object" || Array.isArray(rawUpdates)) {
      throw new HttpsError("invalid-argument", "Updates object is required.");
    }

    const isAdmin = callerRole === "admin";
    const isSelf = callerUid === targetUid;
    if (!isAdmin && !isSelf) {
      throw new HttpsError("permission-denied", "You cannot update this user.");
    }

    const targetRef = db.collection("users").doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new HttpsError("not-found", "Target user not found.");
    }

    const beforeData = targetSnap.data();
    const nextData = { ...beforeData };
    const updatePayload = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (Object.prototype.hasOwnProperty.call(rawUpdates, "displayName")) {
      if (typeof rawUpdates.displayName !== "string" || !rawUpdates.displayName.trim()) {
        throw new HttpsError("invalid-argument", "Display name is required.");
      }
      updatePayload.displayName = rawUpdates.displayName.trim();
      nextData.displayName = updatePayload.displayName;
    }

    if (Object.prototype.hasOwnProperty.call(rawUpdates, "phone")) {
      const phoneValue = typeof rawUpdates.phone === "string" ? rawUpdates.phone : "";
      const phoneError = validatePhone(phoneValue);
      if (phoneError) {
        throw new HttpsError("invalid-argument", phoneError);
      }

      const normalizedPhone = normalizePhone(phoneValue);
      if (
        beforeData.role === "customer"
        && beforeData.hasAuthAccount === true
        && !beforeData.email
        && !normalizedPhone
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Phone number is required for customers without an email address."
        );
      }

      updatePayload.phone = normalizedPhone || null;
      nextData.phone = updatePayload.phone;
    }

    if (Object.prototype.hasOwnProperty.call(rawUpdates, "address")) {
      updatePayload.address = sanitizeAddress(rawUpdates.address);
      nextData.address = updatePayload.address;
    }

    if (isAdmin && Object.prototype.hasOwnProperty.call(rawUpdates, "panNumber")) {
      updatePayload.panNumber =
        typeof rawUpdates.panNumber === "string" && rawUpdates.panNumber.trim()
          ? rawUpdates.panNumber.trim().toUpperCase()
          : null;
      nextData.panNumber = updatePayload.panNumber;
    }

    if (isAdmin && Object.prototype.hasOwnProperty.call(rawUpdates, "aadhaarLastFour")) {
      updatePayload.aadhaarLastFour =
        typeof rawUpdates.aadhaarLastFour === "string" && rawUpdates.aadhaarLastFour.trim()
          ? rawUpdates.aadhaarLastFour.trim()
          : null;
      nextData.aadhaarLastFour = updatePayload.aadhaarLastFour;
    }

    if (isAdmin && Object.prototype.hasOwnProperty.call(rawUpdates, "dateOfBirth")) {
      updatePayload.dateOfBirth =
        typeof rawUpdates.dateOfBirth === "string" && rawUpdates.dateOfBirth.trim()
          ? rawUpdates.dateOfBirth.trim()
          : null;
      nextData.dateOfBirth = updatePayload.dateOfBirth;
    }

    if (isAdmin && Object.prototype.hasOwnProperty.call(rawUpdates, "kycStatus")) {
      if (!ALLOWED_KYC_STATUSES.includes(rawUpdates.kycStatus)) {
        throw new HttpsError("invalid-argument", "Invalid KYC status.");
      }
      updatePayload.kycStatus = rawUpdates.kycStatus;
      nextData.kycStatus = updatePayload.kycStatus;
    }

    if (isAdmin && rawUpdates.markKycVerified === true) {
      updatePayload.kycVerifiedAt = FieldValue.serverTimestamp();
      updatePayload.kycVerifiedBy = callerUid;
      nextData.kycVerifiedBy = callerUid;
    }

    const beforeEntries = getCustomerIdentifierEntries(beforeData, targetUid);
    const afterEntries = getCustomerIdentifierEntries(nextData, targetUid);
    const beforeMap = new Map(beforeEntries.map((entry) => [entry.docId, entry]));
    const afterMap = new Map(afterEntries.map((entry) => [entry.docId, entry]));

    await db.runTransaction(async (transaction) => {
      for (const entry of afterEntries) {
        const identifierRef = db.collection(AUTH_IDENTIFIER_COLLECTION).doc(entry.docId);
        const identifierSnap = await transaction.get(identifierRef);

        if (identifierSnap.exists && identifierSnap.data().userId !== targetUid) {
          if (entry.kind === "email") {
            throw new HttpsError("already-exists", "A user with this email already exists.");
          }
          if (entry.kind === "username") {
            throw new HttpsError("already-exists", "That username is already in use.");
          }
          if (entry.kind === "phone") {
            throw new HttpsError("already-exists", "That phone number is already in use.");
          }
        }
      }

      transaction.update(targetRef, updatePayload);

      beforeMap.forEach((entry, docId) => {
        if (!afterMap.has(docId)) {
          transaction.delete(db.collection(AUTH_IDENTIFIER_COLLECTION).doc(docId));
        }
      });

      afterEntries.forEach((entry) => {
        transaction.set(
          db.collection(AUTH_IDENTIFIER_COLLECTION).doc(entry.docId),
          entry.doc,
          { merge: true }
        );
      });
    });

    return { success: true };
  }
);

// ═══════════════════════════════════════════════════════
// 4. createUserByAdmin — Admin-Only User/Lead Creation
// ═══════════════════════════════════════════════════════
//
// Creates a Firebase Auth account + Firestore doc for a user,
// OR promotes an existing Firestore-only "lead" to a full user.
//
// Uses Admin SDK so the admin's session is NOT affected.
// Customer passwords are supplied by an authorized creator and stored only in Firebase Auth.
//
// Input: { email, displayName, role, password?, phone?, existingDocId? }
// Output: { success: true, uid: string, message: string }
//
exports.createUserByAdmin = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false, // TODO: enable in Phase 2 security hardening
  },
  async (request) => {
    // ── Gate 1: Must be authenticated ──
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    // ── Gate 2: Must be admin ──
    const callerUid = request.auth.uid;
    const callerRole = await resolveCallerRole(request);
    const callerSnapshot = await resolveCallerIdentity(request);

    if (!["admin", "staff", "agent"].includes(callerRole)) {
      throw new HttpsError(
        "permission-denied",
        "You do not have permission to create customer accounts."
      );
    }

    // ── Gate 3: Validate input ──
    const { email, displayName, username, role, phone, existingDocId,
            panNumber, aadhaarLastFour, dateOfBirth, kycStatus, address, password,
            directReferrerId = "" } = request.data;

    if (!displayName || typeof displayName !== "string") {
      throw new HttpsError("invalid-argument", "Display name is required.");
    }

    const targetRole = role || "customer";
    const normalizedEmail = normalizeOptionalEmail(email);
    const normalizedPhone = normalizePhone(phone || "");
    const trimmedUsername = typeof username === "string" ? username.trim() : "";
    const normalizedUsername = normalizeUsername(username || "");
    if (!VALID_ROLES.includes(targetRole)) {
      throw new HttpsError(
        "invalid-argument",
        `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`
      );
    }

    if (normalizedEmail && !looksLikeEmail(normalizedEmail)) {
      throw new HttpsError("invalid-argument", "Valid email is required.");
    }

    const phoneError = validatePhone(phone || "");
    if (phoneError) {
      throw new HttpsError("invalid-argument", phoneError);
    }

    if (callerRole !== "admin" && targetRole !== "customer") {
      throw new HttpsError(
        "permission-denied",
        "Only admins can create non-customer users."
      );
    }

    if (targetRole === "customer") {
      const passwordError = validatePassword(password);
      if (passwordError) {
        throw new HttpsError("invalid-argument", passwordError);
      }
      if (trimmedUsername) {
        const usernameError = validateUsername(trimmedUsername);
        if (usernameError) {
          throw new HttpsError("invalid-argument", usernameError);
        }
      }
      if (!normalizedEmail) {
        if (!trimmedUsername) {
          throw new HttpsError("invalid-argument", "Username is required when email is not provided.");
        }
        if (!normalizedPhone) {
          throw new HttpsError("invalid-argument", "Phone number is required when email is not provided.");
        }
      }
    } else if (!normalizedEmail) {
      throw new HttpsError("invalid-argument", "Valid email is required.");
    }

    let createdAuthUserUid = null;

    try {
      // ── Create Firebase Auth account ──
      let existingData = null;
      let preservedCreator = null;
      const referralSettings = await getReferralCommissionSettings();

      if (existingDocId) {
        const existingDoc = await db.collection("users").doc(existingDocId).get();
        if (!existingDoc.exists) {
          throw new HttpsError("not-found", "Existing customer record not found.");
        }

        existingData = existingDoc.data();
        preservedCreator = await synthesizeLegacyCreator(existingData, callerSnapshot);

        if (targetRole !== "customer") {
          throw new HttpsError(
            "failed-precondition",
            "Lead promotion is only supported for customer accounts."
          );
        }

        if (callerRole === "staff" && existingData.assignedStaffId !== callerUid) {
          throw new HttpsError(
            "permission-denied",
            "Staff can only activate customers assigned to themselves."
          );
        }

        if (callerRole === "agent" && existingData.onboardedByAgent !== callerUid) {
          throw new HttpsError(
            "permission-denied",
            "Agents can only activate customers in their own portfolio."
          );
        }
      }

      const requestedReferrerId = targetRole === "customer"
        ? (directReferrerId || existingData?.referrerId || "")
        : "";
      const referralContext = targetRole === "customer"
        ? await resolveReferralContext(requestedReferrerId, callerSnapshot)
        : {
            directReferrer: null,
            referralPath: [],
            referralRootId: "",
            referralDepth: 0,
          };

      const newUid = db.collection("users").doc().id;
      const authEmail = normalizedEmail || buildSyntheticAuthEmail(newUid);
      const userRecord = await auth.createUser({
        uid: newUid,
        email: authEmail,
        displayName: displayName.trim(),
        disabled: false,
        ...(targetRole === "customer" ? { password } : {}),
      });

      const createdUid = userRecord.uid;
      createdAuthUserUid = createdUid;

      // ── Set custom claim ──
      await auth.setCustomUserClaims(createdUid, { role: targetRole });

      // ── Create or update Firestore doc ──
      const userData = {
        uid: createdUid,
        displayName: displayName.trim(),
        username: trimmedUsername || null,
        normalizedUsername: normalizedUsername || "",
        authEmail,
        email: normalizedEmail || null,
        phone: normalizedPhone || null,
        role: targetRole,
        status: "active",
        panNumber: panNumber || null,
        aadhaarLastFour: aadhaarLastFour || null,
        dateOfBirth: dateOfBirth || null,
        kycStatus: kycStatus || "not_submitted",
        kycVerifiedAt: null,
        kycVerifiedBy: null,
        customerStatus: "active",
        hasAuthAccount: true,
        promotedAt: FieldValue.serverTimestamp(),
        promotedBy: callerUid,
        onboardedByAgent: callerRole === "agent" && targetRole === "customer" ? callerUid : null,
        assignedStaffId: callerRole === "staff" && targetRole === "customer" ? callerUid : null,
        address: address || { street: "", city: "", state: "", zip: "" },
        createdBy: callerUid,
        referrerId: referralContext.directReferrer?.id || "",
        referrerRole: referralContext.directReferrer?.role || "",
        referralRootId: referralContext.referralRootId || "",
        referralDepth: referralContext.referralDepth || 0,
        referralPath: referralContext.referralPath || [],
        createdAt: FieldValue.serverTimestamp(),
        creator: buildCreatorSnapshot(callerSnapshot),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (existingDocId && existingDocId !== createdUid && existingData) {
        userData.panNumber = userData.panNumber || existingData.panNumber || null;
        userData.aadhaarLastFour = userData.aadhaarLastFour || existingData.aadhaarLastFour || null;
        userData.dateOfBirth = userData.dateOfBirth || existingData.dateOfBirth || null;
        userData.kycStatus = existingData.kycStatus || "not_submitted";
        userData.onboardedByAgent = existingData.onboardedByAgent || userData.onboardedByAgent;
        userData.assignedStaffId = existingData.assignedStaffId || userData.assignedStaffId;
        userData.address = existingData.address || userData.address;
        userData.createdAt = existingData.createdAt || FieldValue.serverTimestamp();
        userData.createdBy = existingData.createdBy || callerUid;
        userData.creator = preservedCreator || userData.creator;
        userData.username = userData.username || existingData.username || null;
        userData.normalizedUsername = userData.normalizedUsername || existingData.normalizedUsername || normalizeUsername(existingData.username || "");
        userData.authEmail = userData.authEmail || existingData.authEmail || authEmail;
        userData.email = userData.email || existingData.email || null;
        userData.phone = userData.phone || normalizePhone(existingData.phone || "") || null;
        userData.referrerId = userData.referrerId || existingData.referrerId || "";
        userData.referrerRole = userData.referrerRole || existingData.referrerRole || "";
        userData.referralRootId = userData.referralRootId || existingData.referralRootId || "";
        userData.referralDepth = userData.referralDepth || existingData.referralDepth || 0;
        userData.referralPath = (userData.referralPath && userData.referralPath.length > 0)
          ? userData.referralPath
          : normalizeReferralPath(existingData.referralPath || []);
      }

      const customerIdentifierEntries = targetRole === "customer"
        ? getCustomerIdentifierEntries(userData, createdUid)
        : [];

      await db.runTransaction(async (transaction) => {
        if (
          targetRole === "customer"
          && referralSettings.referralCommissionEnabled
          && userData.referralPath.length > 0
        ) {
          await queueReferralCommissions({
            transaction,
            sourceCustomerId: createdUid,
            directReferrerId: userData.referrerId,
            referralPath: userData.referralPath,
            sourceCustomerName: displayName.trim(),
            settings: referralSettings,
          });
        }

        for (const entry of customerIdentifierEntries) {
          const identifierRef = db.collection(AUTH_IDENTIFIER_COLLECTION).doc(entry.docId);
          const identifierSnap = await transaction.get(identifierRef);

          if (identifierSnap.exists && identifierSnap.data().userId !== createdUid) {
            if (entry.kind === "email") {
              throw new HttpsError("already-exists", "A user with this email already exists.");
            }
            if (entry.kind === "username") {
              throw new HttpsError("already-exists", "That username is already in use.");
            }
            if (entry.kind === "phone") {
              throw new HttpsError("already-exists", "That phone number is already in use.");
            }
          }
        }

        const userRef = db.collection("users").doc(createdUid);
        transaction.set(userRef, userData);
        for (const entry of customerIdentifierEntries) {
          transaction.set(
            db.collection(AUTH_IDENTIFIER_COLLECTION).doc(entry.docId),
            entry.doc,
            { merge: true }
          );
        }

        if (existingDocId && existingDocId !== createdUid) {
          transaction.delete(db.collection("users").doc(existingDocId));
        }
      });

      // ── Send password reset email ──
      // ── Log to activity logs ──
      try {
        await writeActivityLog({
          userId: callerUid,
          action: existingDocId ? "lead_promotion" : "user_creation",
          details: existingDocId
            ? `Promoted lead "${displayName}" to ${targetRole} (Auth account created)`
            : `Created ${targetRole} "${displayName}" (${email})`,
          targetType: "user",
          targetId: newUid,
          metadata: {
            role: targetRole,
            type: existingDocId ? "lead_promotion" : "user_creation",
            createdByRole: callerRole,
            directReferrerId: userData.referrerId || "",
            referralDepth: userData.referralDepth || 0,
            referralPath: userData.referralPath || [],
          },
        });

        if (targetRole === "customer" && userData.referralPath.length > 0) {
          await writeActivityLog({
            userId: callerUid,
            action: "referral_chain_attached",
            details: `Attached referral chain to customer "${displayName}"`,
            targetType: "user",
            targetId: newUid,
            metadata: {
              directReferrerId: userData.referrerId || "",
              referralDepth: userData.referralDepth || 0,
              referralPath: userData.referralPath || [],
            },
          });
        }
      } catch (logError) {
        console.error("createUserByAdmin activity log error:", logError);
      }

      return {
        success: true,
        uid: newUid,
        message: existingDocId
          ? `Lead promoted to ${targetRole}.`
          : `${targetRole} created successfully.`,
      };
    } catch (error) {
      if (createdAuthUserUid) {
        await auth.deleteUser(createdAuthUserUid).catch(() => {});
      }
      console.error("createUserByAdmin error:", {
        callerUid,
        callerRole,
        targetRole,
        email,
        existingDocId: existingDocId || null,
        directReferrerId: directReferrerId || null,
        code: error?.code || null,
        message: error?.message || String(error),
      });
      throw mapCreateUserError(error);
    }
  }
);

// ═══════════════════════════════════════════════════════
// 5. onTransactionCreate — Auto-Commission Calculation
// ═══════════════════════════════════════════════════════
//
// Triggered when a new transaction is created.
// If the transaction has an agentId, auto-creates a 2% commission
// record in the commissions collection.
//
// Security:
//   - Runs server-side only (Cloud Function) — cannot be manipulated client-side
//   - Commission amount is calculated from the transaction amount, not user input
//   - Agent cannot self-create commissions (Firestore rules: admin-only create)
//   - This function uses Admin SDK, bypassing Firestore rules (trusted backend)
//
// Commission Formula:
//   commission = transaction.amount * COMMISSION_RATE
//   Stored in paise (integer) to prevent floating-point errors
//
const COMMISSION_RATE = 0.02; // 2%

exports.onTransactionCreate = onDocumentCreated(
  {
    document: "transactions/{transactionId}",
    region: "us-central1",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log("No data in transaction document");
      return null;
    }

    const txData = snapshot.data();
    const transactionId = event.params.transactionId;

    // ── Gate 1: Only process if transaction has an agentId ──
    if (!txData.agentId) {
      console.log(`Transaction ${transactionId}: No agentId, skipping commission`);
      return null;
    }

    // ── Gate 2: Skip if amount is zero or missing ──
    const txAmount = txData.amount || 0;
    if (txAmount <= 0) {
      console.log(`Transaction ${transactionId}: Zero/negative amount, skipping commission`);
      return null;
    }

    // ── Gate 3: Calculate commission (integer math in paise) ──
    const commissionAmount = Math.round(txAmount * COMMISSION_RATE);
    if (commissionAmount <= 0) {
      console.log(`Transaction ${transactionId}: Commission too small (${commissionAmount}), skipping`);
      return null;
    }

    // ── Create commission record ──
    try {
      const commissionData = {
        agentId: txData.agentId,
        transactionId: transactionId,
        customerId: txData.customerId || null,
        amount: commissionAmount,
        rate: COMMISSION_RATE * 100, // Store as percentage (2)
        status: "pending",
        type: "transaction_commission",
        description: `2% commission on transaction ${transactionId.slice(0, 8)}...`,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      const commRef = await db.collection("commissions").add(commissionData);

      console.log(
        `Commission created: ${commRef.id} | Agent: ${txData.agentId} | ` +
        `Tx: ${transactionId} | Amount: ₹${(commissionAmount / 100).toFixed(2)} ` +
        `(${COMMISSION_RATE * 100}% of ₹${(txAmount / 100).toFixed(2)})`
      );

      // Log to activity logs
      await db.collection("activityLogs").add({
        userId: "system",
        action: `Auto-created commission ₹${(commissionAmount / 100).toFixed(2)} for agent ${txData.agentId}`,
        metadata: {
          commissionId: commRef.id,
          agentId: txData.agentId,
          transactionId: transactionId,
          amount: commissionAmount,
          rate: COMMISSION_RATE * 100,
          type: "auto_commission",
        },
        createdAt: FieldValue.serverTimestamp(),
      });

      return null;
    } catch (error) {
      console.error(`Failed to create commission for tx ${transactionId}:`, error);
      return null;
    }
  }
);
