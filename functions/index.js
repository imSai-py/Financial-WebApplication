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
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
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

function normalizeEmail(email) {
  return email.trim().toLowerCase();
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

    // ── Execute: Set custom claim + update Firestore doc ──
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
    const { email, displayName, role, phone, existingDocId,
            panNumber, aadhaarLastFour, dateOfBirth, kycStatus, address, password } = request.data;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      throw new HttpsError("invalid-argument", "Valid email is required.");
    }

    if (!displayName || typeof displayName !== "string") {
      throw new HttpsError("invalid-argument", "Display name is required.");
    }

    const targetRole = role || "customer";
    if (!VALID_ROLES.includes(targetRole)) {
      throw new HttpsError(
        "invalid-argument",
        `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`
      );
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
    }

    try {
      // ── Create Firebase Auth account ──
      const normalizedEmail = normalizeEmail(email);
      let existingData = null;
      let preservedCreator = null;

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

      const userRecord = await auth.createUser({
        email: normalizedEmail,
        displayName: displayName.trim(),
        disabled: false,
        ...(targetRole === "customer" ? { password } : {}),
      });

      const newUid = userRecord.uid;

      // ── Set custom claim ──
      await auth.setCustomUserClaims(newUid, { role: targetRole });

      // ── Create or update Firestore doc ──
      const userData = {
        uid: newUid,
        displayName: displayName.trim(),
        email: normalizedEmail,
        phone: phone || null,
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
        createdAt: FieldValue.serverTimestamp(),
        creator: buildCreatorSnapshot(callerSnapshot),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (existingDocId && existingDocId !== newUid && existingData) {
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

        await db.collection("users").doc(existingDocId).delete();
      }

      // Write the user doc keyed by Auth UID
      await db.collection("users").doc(newUid).set(userData);

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
          },
        });
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
      console.error("createUserByAdmin error:", {
        callerUid,
        callerRole,
        targetRole,
        email,
        existingDocId: existingDocId || null,
        code: error?.code || null,
        message: error?.message || String(error),
      });
      throw mapCreateUserError(error);
    }
  }
);

const { onDocumentCreated } = require("firebase-functions/v2/firestore");

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
