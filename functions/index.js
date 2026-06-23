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

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { beforeUserCreated } = require("firebase-functions/v2/identity");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");

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
const SUPPORTED_PAYMENT_METHODS = ["UPI", "Bank Transfer", "Cash", "Office Collection"];
const OVERPAYMENT_MODES = {
  REJECT: "reject_entire_request",
  PARTIAL: "accept_only_remaining_amount",
  CREDIT: "accept_full_amount_store_credit",
};

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
  const hasAuth = data.hasAuthAccount === true || data.role !== "customer";
  if (!hasAuth) {
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
  if (!/[^\w\s]/.test(password)) {
    return "Password must include at least one special character.";
  }
  return null;
}

function parseCurrencyAmount(value, fieldName = "Amount") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new HttpsError("invalid-argument", `${fieldName} must be greater than zero.`);
  }

  return Math.round(numeric);
}

function sanitizeText(value, maxLength = 200) {
  if (!value || typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizePaymentMethod(value) {
  const method = sanitizeText(value, 40);
  const exact = SUPPORTED_PAYMENT_METHODS.find((item) => item.toLowerCase() === method.toLowerCase());
  if (!exact) {
    throw new HttpsError(
      "invalid-argument",
      `Payment method must be one of: ${SUPPORTED_PAYMENT_METHODS.join(", ")}.`
    );
  }

  return exact;
}

function generateTemporaryPassword(length = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let password = "";
  const randomBytes = crypto.randomBytes(length * 2);

  for (let index = 0; password.length < length && index < randomBytes.length; index += 1) {
    password += alphabet[randomBytes[index] % alphabet.length];
  }

  const fallback = `${password}Aa1!`;
  return fallback.slice(0, Math.max(length, 12));
}

async function allocateCustomerId(transaction) {
  const counterRef = db.collection("appSettings").doc("sequences");
  const counterSnap = await transaction.get(counterRef);
  const currentValue = counterSnap.exists ? Number(counterSnap.data().customerSequence || 0) : 0;
  const nextValue = currentValue + 1;

  return {
    counterRef,
    nextValue,
    customerId: `INV${String(nextValue).padStart(6, "0")}`,
  };
}

async function createUserNotification(userId, payload = {}) {
  if (!userId) return;

  await db.collection("users").doc(userId).collection("notifications").add({
    title: payload.title || "Update",
    message: payload.message || "",
    type: payload.type || "info",
    link: payload.link || "",
    isRead: false,
    metadata: payload.metadata || {},
    createdAt: FieldValue.serverTimestamp(),
  });
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

async function resolveReferralContext(referrerId) {
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

function httpStatusForHttpsErrorCode(code = "internal") {
  switch (code) {
    case "invalid-argument":
      return 400;
    case "unauthenticated":
      return 401;
    case "permission-denied":
      return 403;
    case "not-found":
      return 404;
    case "already-exists":
      return 409;
    case "failed-precondition":
      return 412;
    default:
      return 500;
  }
}

function toCallableErrorBody(error) {
  const normalized = error instanceof HttpsError
    ? error
    : mapCreateUserError(error);

  return {
    error: {
      status: normalized.code.toUpperCase().replace(/-/g, "_"),
      message: normalized.message || "Internal error.",
      details: normalized.details || null,
    },
  };
}

async function requireAdminCaller(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const callerRole = await resolveCallerRole(request);
  if (callerRole !== "admin") {
    throw new HttpsError("permission-denied", "Only admins can manage passwords.");
  }

  return {
    callerUid: request.auth.uid,
    callerRole,
    callerSnapshot: await resolveCallerIdentity(request),
  };
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

// Kept for legacy commission backfills; activation-time investment commissions use a newer path.
// eslint-disable-next-line no-unused-vars
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

async function getGlobalAppSettings() {
  const settingsDoc = await db.collection("appSettings").doc("global").get();
  return settingsDoc.exists ? settingsDoc.data() : {};
}

function getOverpaymentMode(settings = {}) {
  const configuredMode = sanitizeText(settings.overpaymentMode, 64);
  return Object.values(OVERPAYMENT_MODES).includes(configuredMode)
    ? configuredMode
    : OVERPAYMENT_MODES.REJECT;
}

function normalizeReceiptMetadata(receipt = {}) {
  if (!receipt || typeof receipt !== "object") return null;
  const path = sanitizeText(receipt.path || "", 500);
  if (!path) return null;

  return {
    path,
    url: sanitizeText(receipt.url || "", 1000),
    contentType: sanitizeText(receipt.contentType || "", 100),
    size: Number(receipt.size || 0) || 0,
    name: sanitizeText(receipt.name || "", 200),
    uploadedAt: FieldValue.serverTimestamp(),
  };
}

async function assertManagedCustomerScope(customerId, callerUid, callerRole) {
  const customerRef = db.collection("users").doc(customerId);
  const customerSnap = await customerRef.get();
  if (!customerSnap.exists) {
    throw new HttpsError("not-found", "Customer record not found.");
  }

  const customerData = customerSnap.data();
  if (customerData.role !== "customer") {
    throw new HttpsError("failed-precondition", "Target user must be a customer.");
  }

  if (callerRole === "admin") {
    return { customerRef, customerData };
  }

  const isManagedByStaff = callerRole === "staff" && (
    customerData.assignedStaffId === callerUid
    || customerData.createdBy === callerUid
    || customerData.createdById === callerUid
  );

  const isManagedByAgent = callerRole === "agent" && (
    customerData.onboardedByAgent === callerUid
    || customerData.assignedAgentId === callerUid
    || customerData.createdBy === callerUid
    || customerData.createdById === callerUid
  );

  if (!isManagedByStaff && !isManagedByAgent) {
    throw new HttpsError(
      "permission-denied",
      callerRole === "staff"
        ? "You can only manage customers assigned to you."
        : "You can only manage customers in your portfolio."
    );
  }

  return { customerRef, customerData };
}

function buildInvestmentPlanSnapshot(planData = {}, planId = "") {
  return {
    planId,
    planName: sanitizeText(planData.planName || "Investment Plan", 120),
    requiredAmount: Number(planData.requiredAmount || 0) || 0,
    durationMonths: Number(planData.durationMonths || 0) || 0,
    monthlyReturn: Number(planData.monthlyReturn || 0) || 0,
    totalExpectedReturn: Number(planData.totalExpectedReturn || 0) || 0,
    maturityAmount: Number(planData.maturityAmount || 0) || 0,
    payoutFrequency: sanitizeText(planData.payoutFrequency || "monthly", 30) || "monthly",
    activationRule: sanitizeText(planData.activationRule || "full_funding_required", 60) || "full_funding_required",
  };
}

function addMonths(baseDate, monthsToAdd) {
  const date = new Date(baseDate);
  const originalDate = date.getDate();
  date.setMonth(date.getMonth() + monthsToAdd);
  if (date.getDate() !== originalDate) {
    date.setDate(0);
  }
  return date;
}

function generatePayoutSchedule({ investmentId, customerId, approvedAt, planSnapshot, creatorSnapshot }) {
  const startDate = approvedAt instanceof Date ? approvedAt : new Date(approvedAt);
  const durationMonths = Number(planSnapshot.durationMonths || 0);
  const payoutAmount = Number(planSnapshot.monthlyReturn || 0);
  const payouts = [];

  for (let index = 0; index < durationMonths; index += 1) {
    const monthNumber = index + 1;
    const expectedDate = addMonths(startDate, monthNumber);
    payouts.push({
      ref: db.collection("investmentPayouts").doc(),
      data: {
        investmentId,
        customerId,
        monthNumber,
        amount: payoutAmount,
        expectedDate,
        actualPaidDate: null,
        status: "scheduled",
        transactionReference: "",
        approvedById: "",
        approvedByName: "",
        createdById: creatorSnapshot?.id || "",
        createdByName: creatorSnapshot?.name || "",
        createdByRole: creatorSnapshot?.role || "",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  }

  return payouts;
}

function resolveFundingStatus({ fundedAmount, requiredAmount }) {
  if (fundedAmount >= requiredAmount) return "fully_funded";
  if (fundedAmount > 0) return "partially_funded";
  return "pending";
}

async function recordReferralCommissionActivation({
  transaction,
  investmentId,
  sourceCustomerId,
  sourceCustomerName,
  directReferrerId,
  referralPath,
  settings,
}) {
  const maxDepth = Math.min(
    settings.maxReferralCommissionDepth || MAX_REFERRAL_DEPTH,
    MAX_REFERRAL_DEPTH
  );

  for (let index = 0; index < Math.min(referralPath.length, maxDepth); index += 1) {
    const beneficiary = referralPath[index];
    if (!beneficiary?.id || !REFERRAL_ELIGIBLE_ROLES.includes(beneficiary.role)) {
      continue;
    }

    const level = index + 1;
    const commissionAmount = Number(settings.referralCommissionLevels[index] || 0) || 0;
    if (commissionAmount <= 0) continue;

    const commissionId = buildReferralCommissionDocId({
      sourceCustomerId: `${sourceCustomerId}-${investmentId}`,
      beneficiaryId: beneficiary.id,
      level,
    });
    const commissionDoc = {
      id: commissionId,
      customerId: beneficiary.id,
      referrerId: beneficiary.id,
      referredCustomerId: sourceCustomerId,
      beneficiaryId: beneficiary.id,
      beneficiaryRole: beneficiary.role,
      sourceCustomerId,
      directReferrerId: directReferrerId || "",
      linkedInvestmentId: investmentId,
      commissionAmount,
      commissionType: "investment_activation_referral",
      amount: commissionAmount,
      status: "pending",
      level,
      type: "customer_referral_commission",
      generatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      description: `Referral commission for activated investment of ${sourceCustomerName || sourceCustomerId}`,
      chainSnapshot: referralPath.slice(0, level),
    };

    const legacyRef = db.collection("commissions").doc(commissionId);
    const normalizedRef = db.collection("referralCommissions").doc(commissionId);
    transaction.set(legacyRef, commissionDoc);
    transaction.set(normalizedRef, commissionDoc);
  }
}

async function applyInvestmentActivationIfEligible({
  transaction,
  investmentRef,
  investmentData,
  approverSnapshot,
  finalFundingApprovedAt,
}) {
  const requiredAmount = Number(investmentData.planSnapshot?.requiredAmount || investmentData.requiredAmount || 0) || 0;
  const fundedAmount = Number(investmentData.fundedAmount || 0) || 0;

  if (requiredAmount <= 0 || fundedAmount < requiredAmount || investmentData.lifecycleStatus === "active") {
    return false;
  }

  const approvalDate = finalFundingApprovedAt instanceof Date
    ? finalFundingApprovedAt
    : new Date(finalFundingApprovedAt || Date.now());
  const planSnapshot = buildInvestmentPlanSnapshot(
    investmentData.planSnapshot || investmentData,
    investmentData.planSnapshot?.planId || investmentData.planId || ""
  );

  const payouts = generatePayoutSchedule({
    investmentId: investmentRef.id,
    customerId: investmentData.customerId,
    approvedAt: approvalDate,
    planSnapshot,
    creatorSnapshot: approverSnapshot,
  });

  payouts.forEach(({ ref, data }) => transaction.set(ref, data));

  transaction.update(investmentRef, {
    lifecycleStatus: "active",
    fundingStatus: "fully_funded",
    startDate: approvalDate,
    activatedAt: approvalDate,
    activationApprovedById: approverSnapshot?.id || "",
    activationApprovedByName: approverSnapshot?.name || "",
    activationApprovedByRole: approverSnapshot?.role || "",
    payoutScheduleGenerated: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const settings = await getReferralCommissionSettings();
  if (settings.referralCommissionEnabled && Array.isArray(investmentData.referralPath) && investmentData.referralPath.length > 0) {
    await recordReferralCommissionActivation({
      transaction,
      investmentId: investmentRef.id,
      sourceCustomerId: investmentData.customerId,
      sourceCustomerName: investmentData.customerName || "",
      directReferrerId: investmentData.referrerId || "",
      referralPath: investmentData.referralPath,
      settings,
    });
  }

  return true;
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
  async (_event) => {
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

    if (Object.prototype.hasOwnProperty.call(rawUpdates, "email")) {
      const emailValue = typeof rawUpdates.email === "string" ? rawUpdates.email.trim() : "";
      if (emailValue) {
        if (!looksLikeEmail(emailValue)) {
          throw new HttpsError("invalid-argument", "Valid email format is required.");
        }
        const normalized = normalizeOptionalEmail(emailValue);
        updatePayload.email = normalized;
        updatePayload.authEmail = normalized;
        nextData.email = normalized;
        nextData.authEmail = normalized;
      } else {
        if (
          beforeData.role === "customer"
          && (!beforeData.username || !beforeData.phone)
        ) {
          throw new HttpsError(
            "invalid-argument",
            "Username and phone number are required to remove email address."
          );
        }
        updatePayload.email = null;
        updatePayload.authEmail = buildSyntheticAuthEmail(targetUid);
        nextData.email = null;
        nextData.authEmail = updatePayload.authEmail;
      }

      try {
        await auth.updateUser(targetUid, {
          email: nextData.authEmail,
        });
      } catch (authError) {
        console.error("Auth email update failed in functions:", authError);
        throw new HttpsError("invalid-argument", "Failed to update authentication email: " + authError.message);
      }
    }

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

exports.setManagedUserPassword = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    const { callerUid, callerSnapshot } = await requireAdminCaller(request);
    const targetUid = request.data?.targetUid;
    const newPassword = request.data?.newPassword;

    if (!targetUid || typeof targetUid !== "string") {
      throw new HttpsError("invalid-argument", "Target user id is required.");
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      throw new HttpsError("invalid-argument", passwordError);
    }

    const targetRef = db.collection("users").doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new HttpsError("not-found", "Target user not found.");
    }

    const targetData = targetSnap.data();
    if (!["staff", "agent"].includes(targetData.role)) {
      throw new HttpsError(
        "failed-precondition",
        "Passwords can only be managed for staff and agent accounts."
      );
    }

    try {
      await auth.updateUser(targetUid, {
        password: newPassword,
      });

      await targetRef.update({
        updatedAt: FieldValue.serverTimestamp(),
      });

      await writeActivityLog({
        userId: callerUid,
        action: "password_reset",
        details: `Set a new password for ${targetData.role} "${targetData.displayName || targetUid}"`,
        targetType: "user",
        targetId: targetUid,
        metadata: {
          type: "password_reset",
          targetRole: targetData.role,
          targetDisplayName: targetData.displayName || "",
          actorRole: callerSnapshot.role,
        },
      });

      return {
        success: true,
        message: `Password updated for ${targetData.role}.`,
      };
    } catch (error) {
      console.error("setManagedUserPassword error:", {
        callerUid,
        targetUid,
        targetRole: targetData.role,
        code: error?.code || null,
        message: error?.message || String(error),
      });
      throw mapCreateUserError(error);
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
async function createUserByAdminInternal(request) {
    // ── Gate 1: Must be authenticated ──
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    // ── Gate 2: Must be admin, staff or agent ──
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
      if (password) {
        const passwordError = validatePassword(password);
        if (passwordError) {
          throw new HttpsError("invalid-argument", passwordError);
        }
      }
    } else {
      if (!normalizedEmail) {
        throw new HttpsError("invalid-argument", "Email is required for non-customer accounts.");
      }
      const passwordError = validatePassword(password);
      if (passwordError) {
        throw new HttpsError("invalid-argument", passwordError);
      }
    }

    if (trimmedUsername) {
      const usernameError = validateUsername(trimmedUsername);
      if (usernameError) {
        throw new HttpsError("invalid-argument", usernameError);
      }
    }

    let createdAuthUserUid = null;

    try {
      // ── Create Firebase Auth account ──
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
      const generatedCustomerId = targetRole === "customer" ? `INV-PENDING-${newUid.slice(0, 6).toUpperCase()}` : "";
      const generatedTemporaryPassword = targetRole === "customer"
        ? (password || generateTemporaryPassword(14))
        : password;
      const authEmail = normalizedEmail || buildSyntheticAuthEmail(newUid);
      const userRecord = await auth.createUser({
        uid: newUid,
        email: authEmail,
        displayName: displayName.trim(),
        disabled: false,
        ...(generatedTemporaryPassword ? { password: generatedTemporaryPassword } : {}),
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
        address: address || { street: "", city: "", state: "", zip: "" },
        createdBy: callerUid,
        createdById: callerUid,
        createdByName: callerSnapshot?.name || "",
        createdByRole: callerRole,
        assignedAgentId: callerRole === "agent" ? callerUid : null,
        assignedAgentName: callerRole === "agent" ? callerSnapshot?.name || "" : "",
        assignedStaffId: callerRole === "staff" ? callerUid : null,
        assignedStaffName: callerRole === "staff" ? callerSnapshot?.name || "" : "",
        createdAt: FieldValue.serverTimestamp(),
        creator: buildCreatorSnapshot(callerSnapshot),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (targetRole === "customer") {
        userData.customerStatus = "active";
        userData.hasAuthAccount = true;
        userData.promotedAt = FieldValue.serverTimestamp();
        userData.promotedBy = callerUid;
        userData.onboardedByAgent = callerRole === "agent" ? callerUid : null;
        userData.assignedStaffId = callerRole === "staff" ? callerUid : null;
        userData.assignedStaffName = callerRole === "staff" ? callerSnapshot?.name || "" : "";
        userData.referrerId = referralContext.directReferrer?.id || "";
        userData.referrerRole = referralContext.directReferrer?.role || "";
        userData.referralRootId = referralContext.referralRootId || "";
        userData.referralDepth = referralContext.referralDepth || 0;
        userData.referralPath = referralContext.referralPath || [];
        userData.referrerCustomerId = referralContext.directReferrer?.id || "";
        userData.referredByName = referralContext.directReferrer?.name || "";
        userData.referralLevel = referralContext.referralDepth || 0;
        userData.directReferralCount = existingData?.directReferralCount || 0;
        userData.totalReferralCount = existingData?.totalReferralCount || 0;
        userData.referralEarnings = existingData?.referralEarnings || 0;
        userData.customerId = generatedCustomerId;
        userData.username = generatedCustomerId;
        userData.normalizedUsername = normalizeUsername(generatedCustomerId);
        userData.mustChangePassword = true;
        userData.temporaryPasswordIssuedAt = FieldValue.serverTimestamp();
        userData.loginActivity = {
          lastLoginAt: null,
          lastPasswordResetAt: null,
          failedAttempts: 0,
        };
      }

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
        userData.createdById = existingData.createdById || existingData.createdBy || callerUid;
        userData.createdByName = existingData.createdByName || callerSnapshot?.name || "";
        userData.createdByRole = existingData.createdByRole || callerRole;
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
        userData.referrerCustomerId = userData.referrerCustomerId || existingData.referrerCustomerId || "";
        userData.referredByName = userData.referredByName || existingData.referredByName || "";
        userData.customerId = existingData.customerId || userData.customerId;
        userData.username = existingData.customerId || userData.username || existingData.username || null;
        userData.normalizedUsername = normalizeUsername(userData.username || existingData.username || "");
        userData.mustChangePassword = true;
      }

      await db.runTransaction(async (transaction) => {
        let customerSequenceAllocation = null;
        const needsCustomerId = targetRole === "customer"
          && (!userData.customerId || String(userData.customerId).startsWith("INV-PENDING-"));
        if (needsCustomerId) {
          customerSequenceAllocation = await allocateCustomerId(transaction);
          userData.customerId = customerSequenceAllocation.customerId;
          userData.username = customerSequenceAllocation.customerId;
          userData.normalizedUsername = normalizeUsername(customerSequenceAllocation.customerId);
        }

        const customerIdentifierEntries = getCustomerIdentifierEntries(userData, createdUid);
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
        if (customerSequenceAllocation) {
          transaction.set(customerSequenceAllocation.counterRef, {
            customerSequence: customerSequenceAllocation.nextValue,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }

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
        customerId: userData.customerId || "",
        temporaryPassword: targetRole === "customer" ? generatedTemporaryPassword : undefined,
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

exports.createUserByAdmin = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false, // TODO: enable in Phase 2 security hardening
  },
  async (request) => createUserByAdminInternal(request)
);

exports.createUserByAdminHttp = onRequest(
  {
    region: "us-central1",
    cors: true,
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({
        error: {
          status: "METHOD_NOT_ALLOWED",
          message: "Only POST requests are supported.",
        },
      });
      return;
    }

    try {
      let authUser = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const idToken = authHeader.substring(7);
        try {
          const decodedToken = await auth.verifyIdToken(idToken);
          authUser = {
            uid: decodedToken.uid,
            token: decodedToken,
          };
        } catch (authError) {
          console.error("verifyIdToken error in createUserByAdminHttp:", authError);
          throw new HttpsError("unauthenticated", "Invalid or expired token.");
        }
      }

      if (!authUser) {
        throw new HttpsError("unauthenticated", "Authentication required.");
      }

      const result = await createUserByAdminInternal({
        auth: authUser,
        data: req.body?.data || req.body || {},
      });

      res.status(200).json({ result });
    } catch (error) {
      const normalized = error instanceof HttpsError
        ? error
        : mapCreateUserError(error);

      console.error("createUserByAdminHttp error:", {
        method: req.method,
        origin: req.get("origin") || null,
        userAgent: req.get("user-agent") || null,
        code: normalized.code || null,
        message: normalized.message || String(error),
      });

      res
        .status(httpStatusForHttpsErrorCode(normalized.code))
        .json(toCallableErrorBody(normalized));
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
exports.recordLoginActivity = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    await db.collection("users").doc(request.auth.uid).set({
      loginActivity: {
        lastLoginAt: FieldValue.serverTimestamp(),
        lastLoginProvider: "password",
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await writeActivityLog({
      userId: request.auth.uid,
      action: "auth.login",
      details: "User signed in",
      targetType: "user",
      targetId: request.auth.uid,
      metadata: { type: "auth_login" },
    }).catch(() => {});

    return { success: true };
  }
);

exports.completeFirstLoginPasswordChange = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    await db.collection("users").doc(request.auth.uid).set({
      mustChangePassword: false,
      passwordChangedAt: FieldValue.serverTimestamp(),
      loginActivity: {
        lastPasswordResetAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await writeActivityLog({
      userId: request.auth.uid,
      action: "auth.password_changed",
      details: "Completed required first-login password change",
      targetType: "user",
      targetId: request.auth.uid,
      metadata: { type: "first_login_password_change" },
    }).catch(() => {});

    return { success: true };
  }
);

exports.createInvestmentPlan = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    const { callerUid, callerSnapshot } = await requireAdminCaller(request);
    const data = request.data || {};
    const planName = sanitizeText(data.planName, 120);
    const requiredAmount = parseCurrencyAmount(data.requiredAmount, "Required amount");
    const durationMonths = Number(data.durationMonths);
    const monthlyReturn = parseCurrencyAmount(data.monthlyReturn, "Monthly return");

    if (!planName) {
      throw new HttpsError("invalid-argument", "Plan name is required.");
    }
    if (!Number.isInteger(durationMonths) || durationMonths <= 0 || durationMonths > 240) {
      throw new HttpsError("invalid-argument", "Duration must be a valid number of months.");
    }

    const totalExpectedReturn = Number(data.totalExpectedReturn || monthlyReturn * durationMonths);
    const maturityAmount = Number(data.maturityAmount || requiredAmount + totalExpectedReturn);
    const planRef = db.collection("investmentPlans").doc();
    const payload = {
      planName,
      requiredAmount,
      durationMonths,
      monthlyReturn,
      totalExpectedReturn: Math.round(totalExpectedReturn),
      maturityAmount: Math.round(maturityAmount),
      payoutFrequency: sanitizeText(data.payoutFrequency || "monthly", 30) || "monthly",
      activationRule: sanitizeText(data.activationRule || "full_funding_required", 60) || "full_funding_required",
      status: data.status === "inactive" ? "inactive" : "active",
      createdById: callerUid,
      createdByName: callerSnapshot.name || "",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await planRef.set(payload);
    await writeActivityLog({
      userId: callerUid,
      action: "investment_plan.create",
      details: `Created investment plan "${planName}"`,
      targetType: "investmentPlan",
      targetId: planRef.id,
      metadata: { type: "investment_plan_create", planName },
    }).catch(() => {});

    return { success: true, id: planRef.id };
  }
);

exports.createInvestmentForCustomer = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const callerUid = request.auth.uid;
    const callerRole = await resolveCallerRole(request);
    const callerSnapshot = await resolveCallerIdentity(request);
    if (!["admin", "staff", "agent"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Only admin, staff, or agent users can create investments.");
    }

    const customerId = sanitizeText(request.data?.customerId, 128);
    const planId = sanitizeText(request.data?.planId, 128);
    if (!customerId || !planId) {
      throw new HttpsError("invalid-argument", "Customer and plan are required.");
    }

    const { customerData } = await assertManagedCustomerScope(customerId, callerUid, callerRole);
    const planRef = db.collection("investmentPlans").doc(planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists || planSnap.data().status === "inactive") {
      throw new HttpsError("not-found", "Active investment plan not found.");
    }

    const planSnapshot = buildInvestmentPlanSnapshot(planSnap.data(), planId);
    const investmentRef = db.collection("investments").doc();
    await investmentRef.set({
      customerId,
      customerCode: customerData.customerId || "",
      customerName: customerData.displayName || "",
      planId,
      planSnapshot,
      requiredAmount: planSnapshot.requiredAmount,
      fundedAmount: 0,
      remainingFundingAmount: planSnapshot.requiredAmount,
      fundingStatus: "pending",
      lifecycleStatus: "pending_activation",
      startDate: null,
      maturityDate: null,
      closureDate: null,
      finalReturnAmount: 0,
      referrerId: customerData.referrerId || "",
      referralPath: normalizeReferralPath(customerData.referralPath || []),
      assignedAgentId: customerData.assignedAgentId || customerData.onboardedByAgent || "",
      assignedAgentName: customerData.assignedAgentName || "",
      assignedStaffId: customerData.assignedStaffId || "",
      assignedStaffName: customerData.assignedStaffName || "",
      createdById: callerUid,
      createdByName: callerSnapshot.name || "",
      createdByRole: callerRole,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await createUserNotification(customerId, {
      title: "Investment selected",
      message: `${planSnapshot.planName} is ready for funding.`,
      type: "info",
      link: "/investments",
      metadata: { investmentId: investmentRef.id },
    });

    return { success: true, id: investmentRef.id };
  }
);

exports.submitInvestmentFundingRequest = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const callerUid = request.auth.uid;
    const callerRole = await resolveCallerRole(request);
    if (callerRole !== "customer") {
      throw new HttpsError("permission-denied", "Only customers can submit funding requests.");
    }

    const investmentId = sanitizeText(request.data?.investmentId, 128);
    const amount = parseCurrencyAmount(request.data?.amount, "Payment amount");
    const paymentMethod = normalizePaymentMethod(request.data?.paymentMethod || "UPI");
    const transactionReference = sanitizeText(request.data?.transactionReference, 120).toUpperCase();
    const paymentDate = sanitizeText(request.data?.paymentDate, 40);
    const receipt = normalizeReceiptMetadata(request.data?.receipt);

    if (!investmentId) {
      throw new HttpsError("invalid-argument", "Investment is required.");
    }
    if (!transactionReference && !["Cash", "Office Collection"].includes(paymentMethod)) {
      throw new HttpsError("invalid-argument", "UTR or transaction reference is required.");
    }

    const investmentRef = db.collection("investments").doc(investmentId);
    const investmentSnap = await investmentRef.get();
    if (!investmentSnap.exists || investmentSnap.data().customerId !== callerUid) {
      throw new HttpsError("not-found", "Investment not found.");
    }

    if (transactionReference) {
      const duplicateSnap = await db.collection("investmentFundingRequests")
        .where("transactionReference", "==", transactionReference)
        .where("status", "in", ["pending", "approved"])
        .limit(1)
        .get();
      if (!duplicateSnap.empty) {
        throw new HttpsError("already-exists", "This UTR/reference has already been submitted.");
      }
    }

    const requestRef = db.collection("investmentFundingRequests").doc();
    const investmentData = investmentSnap.data();
    await requestRef.set({
      customerId: callerUid,
      customerCode: investmentData.customerCode || "",
      customerName: investmentData.customerName || "",
      investmentId,
      planId: investmentData.planSnapshot?.planId || investmentData.planId || "",
      planName: investmentData.planSnapshot?.planName || "",
      assignedStaffId: investmentData.assignedStaffId || "",
      assignedAgentId: investmentData.assignedAgentId || "",
      paymentMethod,
      submittedAmount: amount,
      approvedAmount: 0,
      excessAmount: 0,
      transactionReference,
      paymentDate: paymentDate || null,
      receipt,
      status: "pending",
      verificationStatus: "pending",
      remarks: "",
      rejectionReason: "",
      submittedById: callerUid,
      submittedByRole: callerRole,
      submittedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await createUserNotification(callerUid, {
      title: "Funding request submitted",
      message: `Your ${paymentMethod} payment of ${amount} is pending verification.`,
      type: "info",
      link: "/investments",
      metadata: { investmentId, fundingRequestId: requestRef.id },
    });

    return { success: true, id: requestRef.id };
  }
);

exports.createOfficeCollection = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const callerUid = request.auth.uid;
    const callerRole = await resolveCallerRole(request);
    const callerSnapshot = await resolveCallerIdentity(request);
    if (!["admin", "staff"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Only admin or staff can record office collections.");
    }

    const investmentId = sanitizeText(request.data?.investmentId, 128);
    const amount = parseCurrencyAmount(request.data?.amount, "Collected amount");
    const paymentMethod = normalizePaymentMethod(request.data?.paymentMethod || "Office Collection");
    const transactionReference = sanitizeText(request.data?.transactionReference || `OFFICE-${Date.now()}`, 120).toUpperCase();
    const notes = sanitizeText(request.data?.notes, 500);

    if (!["Cash", "Office Collection"].includes(paymentMethod)) {
      throw new HttpsError("invalid-argument", "Office collections must use Cash or Office Collection.");
    }

    const investmentSnap = await db.collection("investments").doc(investmentId).get();
    if (!investmentSnap.exists) {
      throw new HttpsError("not-found", "Investment not found.");
    }

    const investmentData = investmentSnap.data();
    await assertManagedCustomerScope(investmentData.customerId, callerUid, callerRole);

    const requestRef = db.collection("investmentFundingRequests").doc();
    await requestRef.set({
      customerId: investmentData.customerId,
      customerCode: investmentData.customerCode || "",
      customerName: investmentData.customerName || "",
      investmentId,
      planId: investmentData.planSnapshot?.planId || investmentData.planId || "",
      planName: investmentData.planSnapshot?.planName || "",
      assignedStaffId: investmentData.assignedStaffId || "",
      assignedAgentId: investmentData.assignedAgentId || "",
      paymentMethod,
      submittedAmount: amount,
      approvedAmount: 0,
      excessAmount: 0,
      transactionReference,
      paymentDate: new Date().toISOString().slice(0, 10),
      receipt: null,
      status: "pending",
      verificationStatus: "pending",
      remarks: notes,
      rejectionReason: "",
      collectedByStaffId: callerUid,
      collectedByStaffName: callerSnapshot.name || "",
      submittedById: callerUid,
      submittedByRole: callerRole,
      submittedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, id: requestRef.id };
  }
);

exports.verifyInvestmentFundingRequest = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const callerUid = request.auth.uid;
    const callerRole = await resolveCallerRole(request);
    const callerSnapshot = await resolveCallerIdentity(request);
    if (!["admin", "staff"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Only admin or staff can verify funding requests.");
    }

    const fundingRequestId = sanitizeText(request.data?.fundingRequestId, 128);
    const action = sanitizeText(request.data?.action, 20).toLowerCase();
    const remarks = sanitizeText(request.data?.remarks, 500);
    if (!fundingRequestId || !["approve", "reject"].includes(action)) {
      throw new HttpsError("invalid-argument", "Funding request and action are required.");
    }
    if (action === "reject" && !remarks) {
      throw new HttpsError("invalid-argument", "Rejection reason is required.");
    }

    const requestRef = db.collection("investmentFundingRequests").doc(fundingRequestId);
    let notificationTarget = "";
    let notificationPayload = null;
    let activatedInvestment = false;

    await db.runTransaction(async (transaction) => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists) {
        throw new HttpsError("not-found", "Funding request not found.");
      }

      const requestData = requestSnap.data();
      if (requestData.status !== "pending") {
        throw new HttpsError("failed-precondition", "Only pending funding requests can be verified.");
      }

      const investmentRef = db.collection("investments").doc(requestData.investmentId);
      const investmentSnap = await transaction.get(investmentRef);
      if (!investmentSnap.exists) {
        throw new HttpsError("not-found", "Investment not found.");
      }

      const investmentData = investmentSnap.data();
      if (callerRole === "staff" && investmentData.assignedStaffId !== callerUid && investmentData.createdById !== callerUid) {
        throw new HttpsError("permission-denied", "You can only verify funding for managed investors.");
      }

      if (action === "reject") {
        transaction.update(requestRef, {
          status: "rejected",
          verificationStatus: "rejected",
          rejectionReason: remarks,
          remarks,
          verifiedById: callerUid,
          verifiedByName: callerSnapshot.name || "",
          verifiedByRole: callerRole,
          verifiedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        notificationTarget = requestData.customerId;
        notificationPayload = {
          title: "Funding request rejected",
          message: remarks,
          type: "warning",
          link: "/investments",
          metadata: { fundingRequestId, investmentId: requestData.investmentId },
        };
        return;
      }

      const settings = await getGlobalAppSettings();
      const overpaymentMode = getOverpaymentMode(settings);
      const requiredAmount = Number(investmentData.requiredAmount || investmentData.planSnapshot?.requiredAmount || 0);
      const currentFunded = Number(investmentData.fundedAmount || 0);
      const remaining = Math.max(0, requiredAmount - currentFunded);
      const submittedAmount = Number(requestData.submittedAmount || 0);

      if (remaining <= 0) {
        throw new HttpsError("failed-precondition", "Investment is already fully funded.");
      }
      if (submittedAmount > remaining && overpaymentMode === OVERPAYMENT_MODES.REJECT) {
        throw new HttpsError("failed-precondition", "Payment exceeds remaining funding amount.");
      }

      const approvedAmount = submittedAmount > remaining && overpaymentMode === OVERPAYMENT_MODES.PARTIAL
        ? remaining
        : submittedAmount;
      const excessAmount = Math.max(0, submittedAmount - approvedAmount);
      const nextFundedAmount = currentFunded + approvedAmount;
      const nextRemaining = Math.max(0, requiredAmount - nextFundedAmount);
      const nextFundingStatus = resolveFundingStatus({
        fundedAmount: nextFundedAmount,
        requiredAmount,
      });

      transaction.update(requestRef, {
        status: "approved",
        verificationStatus: "approved",
        approvedAmount,
        excessAmount,
        overpaymentMode,
        remarks,
        verifiedById: callerUid,
        verifiedByName: callerSnapshot.name || "",
        verifiedByRole: callerRole,
        verifiedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.update(investmentRef, {
        fundedAmount: nextFundedAmount,
        remainingFundingAmount: nextRemaining,
        fundingStatus: nextFundingStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const txRef = db.collection("transactions").doc();
      transaction.set(txRef, {
        customerId: requestData.customerId,
        amount: approvedAmount,
        type: requestData.paymentMethod === "Cash" || requestData.paymentMethod === "Office Collection"
          ? "office_collection"
          : "investment_funding",
        status: "completed",
        investmentId: requestData.investmentId,
        fundingRequestId,
        paymentMethod: requestData.paymentMethod,
        transactionReference: requestData.transactionReference || "",
        staffId: callerRole === "staff" ? callerUid : "",
        assignedStaffId: investmentData.assignedStaffId || "",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        effectiveDate: FieldValue.serverTimestamp(),
      });

      if (excessAmount > 0 && overpaymentMode === OVERPAYMENT_MODES.CREDIT) {
        const creditRef = db.collection("investmentCredits").doc();
        transaction.set(creditRef, {
          customerId: requestData.customerId,
          investmentId: requestData.investmentId,
          fundingRequestId,
          amount: excessAmount,
          status: "available",
          createdAt: FieldValue.serverTimestamp(),
          createdById: callerUid,
        });
      }

      if (nextFundingStatus === "fully_funded") {
        const activationData = {
          ...investmentData,
          fundedAmount: nextFundedAmount,
          fundingStatus: nextFundingStatus,
        };
        activatedInvestment = await applyInvestmentActivationIfEligible({
          transaction,
          investmentRef,
          investmentData: activationData,
          approverSnapshot: callerSnapshot,
          finalFundingApprovedAt: new Date(),
        });
      }

      notificationTarget = requestData.customerId;
      notificationPayload = {
        title: activatedInvestment ? "Investment activated" : "Funding request approved",
        message: activatedInvestment
          ? "Your investment is fully funded and has been activated."
          : `Funding of ${approvedAmount} has been approved.`,
        type: "success",
        link: "/investments",
        metadata: { fundingRequestId, investmentId: requestData.investmentId },
      };
    });

    if (notificationTarget && notificationPayload) {
      await createUserNotification(notificationTarget, notificationPayload);
    }

    await writeActivityLog({
      userId: callerUid,
      action: `investment_funding.${action}`,
      details: `${action === "approve" ? "Approved" : "Rejected"} funding request ${fundingRequestId}`,
      targetType: "investmentFundingRequest",
      targetId: fundingRequestId,
      metadata: { type: "investment_funding_verification", action },
    }).catch(() => {});

    return { success: true, activated: activatedInvestment };
  }
);

exports.approveInvestmentPayout = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    const { callerUid, callerSnapshot } = await requireAdminCaller(request);
    const payoutId = sanitizeText(request.data?.payoutId, 128);
    const actualPaidDateInput = sanitizeText(request.data?.actualPaidDate, 40);
    const transactionReference = sanitizeText(request.data?.transactionReference, 120);

    if (!payoutId || !transactionReference) {
      throw new HttpsError("invalid-argument", "Payout and transaction reference are required.");
    }

    let customerId = "";
    let investmentId = "";

    await db.runTransaction(async (transaction) => {
      const payoutRef = db.collection("investmentPayouts").doc(payoutId);
      const payoutSnap = await transaction.get(payoutRef);
      if (!payoutSnap.exists) {
        throw new HttpsError("not-found", "Payout not found.");
      }

      const payoutData = payoutSnap.data();
      if (!["pending", "scheduled", "overdue"].includes(payoutData.status)) {
        throw new HttpsError("failed-precondition", "Only unpaid payouts can be approved.");
      }

      const investmentRef = db.collection("investments").doc(payoutData.investmentId);
      const investmentSnap = await transaction.get(investmentRef);
      if (!investmentSnap.exists) {
        throw new HttpsError("not-found", "Investment not found.");
      }

      const remainingPayoutsSnap = await transaction.get(
        db.collection("investmentPayouts")
          .where("investmentId", "==", payoutData.investmentId)
          .where("status", "in", ["pending", "scheduled", "overdue"])
      );

      const actualPaidDate = actualPaidDateInput ? new Date(actualPaidDateInput) : new Date();
      customerId = payoutData.customerId;
      investmentId = payoutData.investmentId;

      transaction.update(payoutRef, {
        status: "paid",
        actualPaidDate,
        transactionReference,
        approvedById: callerUid,
        approvedByName: callerSnapshot.name || "",
        approvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const txRef = db.collection("transactions").doc();
      transaction.set(txRef, {
        customerId: payoutData.customerId,
        amount: Number(payoutData.amount || 0),
        type: "investment_payout",
        status: "completed",
        investmentId: payoutData.investmentId,
        payoutId,
        transactionReference,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        effectiveDate: actualPaidDate,
      });

      if (remainingPayoutsSnap.docs.length === 1 && remainingPayoutsSnap.docs[0].id === payoutId) {
        transaction.update(investmentRef, {
          lifecycleStatus: "closed",
          maturityDate: actualPaidDate,
          closureDate: actualPaidDate,
          finalReturnAmount: FieldValue.increment(Number(payoutData.amount || 0)),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    if (customerId) {
      await createUserNotification(customerId, {
        title: "Payout paid",
        message: "Your investment payout has been marked as paid.",
        type: "success",
        link: "/investments",
        metadata: { payoutId, investmentId },
      });
    }

    return { success: true };
  }
);

exports.recordInvestmentPayout = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const callerUid = request.auth.uid;
    const callerRole = await resolveCallerRole(request);
    const callerSnapshot = await resolveCallerIdentity(request);
    if (!["admin", "staff"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Only admin or staff can record payouts.");
    }

    const payoutId = sanitizeText(request.data?.payoutId, 128);
    const actualPaidDateInput = sanitizeText(request.data?.actualPaidDate, 40);
    const transactionReference = sanitizeText(request.data?.transactionReference, 120);
    const remarks = sanitizeText(request.data?.remarks, 500);
    if (!payoutId || !transactionReference) {
      throw new HttpsError("invalid-argument", "Payout and transaction reference are required.");
    }

    const payoutRef = db.collection("investmentPayouts").doc(payoutId);
    const payoutSnap = await payoutRef.get();
    if (!payoutSnap.exists) {
      throw new HttpsError("not-found", "Payout not found.");
    }

    const payoutData = payoutSnap.data();
    const investmentSnap = await db.collection("investments").doc(payoutData.investmentId).get();
    if (!investmentSnap.exists) {
      throw new HttpsError("not-found", "Investment not found.");
    }
    const investmentData = investmentSnap.data();

    if (callerRole === "staff" && investmentData.assignedStaffId !== callerUid && investmentData.createdById !== callerUid) {
      throw new HttpsError("permission-denied", "You can only record payouts for managed investors.");
    }
    if (!["pending", "scheduled", "overdue"].includes(payoutData.status)) {
      throw new HttpsError("failed-precondition", "Only unpaid payouts can be recorded.");
    }

    await payoutRef.update({
      payoutRecorded: true,
      recordedById: callerUid,
      recordedByName: callerSnapshot.name || "",
      recordedByRole: callerRole,
      recordedAt: FieldValue.serverTimestamp(),
      proposedActualPaidDate: actualPaidDateInput ? new Date(actualPaidDateInput) : new Date(),
      proposedTransactionReference: transactionReference,
      payoutRemarks: remarks,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeActivityLog({
      userId: callerUid,
      action: "investment_payout.record",
      details: `Recorded payout ${payoutId} for admin approval`,
      targetType: "investmentPayout",
      targetId: payoutId,
      metadata: { type: "investment_payout_record", investmentId: payoutData.investmentId },
    }).catch(() => {});

    return { success: true };
  }
);

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
