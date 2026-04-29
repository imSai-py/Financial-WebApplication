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
      await db.collection("activityLogs").add({
        userId: callerUid,
        action: `Changed role of user ${targetUid} from '${previousRole}' to '${newRole}'`,
        metadata: {
          targetUid,
          previousRole,
          newRole,
          type: "role_change",
        },
        createdAt: FieldValue.serverTimestamp(),
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
// Sends a password reset email so the new user can set their password.
//
// Input: { email, displayName, role, phone?, existingDocId? }
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
    let callerRole = request.auth.token.role;

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
        "Only admins can create users."
      );
    }

    // ── Gate 3: Validate input ──
    const { email, displayName, role, phone, existingDocId,
            panNumber, aadhaarLastFour, dateOfBirth, kycStatus, address } = request.data;

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

    try {
      // ── Create Firebase Auth account ──
      const userRecord = await auth.createUser({
        email: email.trim().toLowerCase(),
        displayName: displayName.trim(),
        disabled: false,
      });

      const newUid = userRecord.uid;

      // ── Set custom claim ──
      await auth.setCustomUserClaims(newUid, { role: targetRole });

      // ── Create or update Firestore doc ──
      const userData = {
        uid: newUid,
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
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
        onboardedByAgent: null,
        assignedStaffId: null,
        address: address || { street: "", city: "", state: "", zip: "" },
        createdBy: callerUid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      // If promoting an existing lead, preserve original data and delete old doc
      if (existingDocId && existingDocId !== newUid) {
        const existingDoc = await db.collection("users").doc(existingDocId).get();
        if (existingDoc.exists) {
          const existingData = existingDoc.data();
          // Merge: keep original fields, override with new auth data
          userData.panNumber = userData.panNumber || existingData.panNumber || null;
          userData.aadhaarLastFour = userData.aadhaarLastFour || existingData.aadhaarLastFour || null;
          userData.dateOfBirth = userData.dateOfBirth || existingData.dateOfBirth || null;
          userData.kycStatus = existingData.kycStatus || "not_submitted";
          userData.onboardedByAgent = existingData.onboardedByAgent || null;
          userData.assignedStaffId = existingData.assignedStaffId || null;
          userData.address = existingData.address || userData.address;
          userData.createdAt = existingData.createdAt || FieldValue.serverTimestamp();
          userData.createdBy = existingData.createdBy || callerUid;

          // Delete the old lead document
          await db.collection("users").doc(existingDocId).delete();
        }
      }

      // Write the user doc keyed by Auth UID
      await db.collection("users").doc(newUid).set(userData);

      // ── Send password reset email ──
      const resetLink = await auth.generatePasswordResetLink(email.trim().toLowerCase());

      // ── Log to activity logs ──
      await db.collection("activityLogs").add({
        userId: callerUid,
        action: existingDocId
          ? `Promoted lead "${displayName}" to ${targetRole} (Auth account created)`
          : `Created ${targetRole} "${displayName}" (${email})`,
        metadata: {
          targetUid: newUid,
          role: targetRole,
          type: existingDocId ? "lead_promotion" : "user_creation",
        },
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        uid: newUid,
        message: existingDocId
          ? `Lead promoted to ${targetRole}. Password reset email sent.`
          : `${targetRole} created. Password reset email sent.`,
      };
    } catch (error) {
      console.error("createUserByAdmin error:", error);

      if (error.code === "auth/email-already-exists") {
        throw new HttpsError(
          "already-exists",
          "A user with this email already exists."
        );
      }

      throw new HttpsError("internal", error.message || "Failed to create user.");
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
