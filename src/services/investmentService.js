import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  getDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, functions, storage } from '../config/firebase';

const plansCol = collection(db, 'investmentPlans');
const investmentsCol = collection(db, 'investments');
const fundingRequestsCol = collection(db, 'investmentFundingRequests');
const payoutsCol = collection(db, 'investmentPayouts');
const commissionsCol = collection(db, 'referralCommissions');

function mapDocs(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function callFunction(name, payload) {
  const callable = httpsCallable(functions, name);
  const result = await callable(payload);
  return result.data;
}

export async function getInvestmentPlans({ includeInactive = false } = {}) {
  const snap = includeInactive
    ? await getDocs(query(plansCol, orderBy('createdAt', 'desc')))
    : await getDocs(query(plansCol, where('status', '==', 'active'), orderBy('createdAt', 'desc')));
  return mapDocs(snap);
}

export async function createInvestmentPlan(payload) {
  return callFunction('createInvestmentPlan', payload);
}

export async function createInvestmentForCustomer(payload) {
  return callFunction('createInvestmentForCustomer', payload);
}

export async function getInvestments(userProfile) {
  const role = userProfile?.role;
  const uid = userProfile?.uid;
  if (role === 'admin') {
    const snap = await getDocs(query(investmentsCol, orderBy('createdAt', 'desc')));
    return mapDocs(snap);
  }
  if (role === 'staff') {
    const [assigned, created] = await Promise.all([
      getDocs(query(investmentsCol, where('assignedStaffId', '==', uid), orderBy('createdAt', 'desc'))),
      getDocs(query(investmentsCol, where('createdById', '==', uid), orderBy('createdAt', 'desc'))),
    ]);
    const records = [...mapDocs(assigned), ...mapDocs(created)];
    return Array.from(new Map(records.map((item) => [item.id, item])).values());
  }
  if (role === 'agent') {
    const snap = await getDocs(query(investmentsCol, where('assignedAgentId', '==', uid), orderBy('createdAt', 'desc')));
    return mapDocs(snap);
  }
  if (role === 'customer') {
    return getInvestmentsByCustomer(uid);
  }
  return [];
}

export async function getInvestmentsByCustomer(customerId) {
  const snap = await getDocs(query(
    investmentsCol,
    where('customerId', '==', customerId),
    orderBy('createdAt', 'desc')
  ));
  return mapDocs(snap);
}

export async function getInvestmentById(investmentId) {
  const snap = await getDoc(doc(db, 'investments', investmentId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getFundingRequests(userProfile) {
  const role = userProfile?.role;
  const uid = userProfile?.uid;
  if (role === 'admin') {
    const snap = await getDocs(query(fundingRequestsCol, orderBy('createdAt', 'desc')));
    return mapDocs(snap);
  }
  if (role === 'staff') {
    const snap = await getDocs(query(
      fundingRequestsCol,
      where('assignedStaffId', '==', uid),
      orderBy('createdAt', 'desc')
    ));
    return mapDocs(snap);
  }
  if (role === 'customer') {
    const snap = await getDocs(query(fundingRequestsCol, where('customerId', '==', uid), orderBy('createdAt', 'desc')));
    return mapDocs(snap);
  }
  return [];
}

export async function getFundingRequestsByInvestment(investmentId) {
  const snap = await getDocs(query(
    fundingRequestsCol,
    where('investmentId', '==', investmentId),
    orderBy('createdAt', 'desc')
  ));
  return mapDocs(snap);
}

export async function uploadFundingReceipt({ userId, file }) {
  if (!file) return null;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `fundingReceipts/${userId}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' });
  const url = await getDownloadURL(storageRef);
  return {
    path,
    url,
    name: file.name,
    size: file.size,
    contentType: file.type || '',
  };
}

export async function submitInvestmentFundingRequest(payload) {
  return callFunction('submitInvestmentFundingRequest', payload);
}

export async function createOfficeCollection(payload) {
  return callFunction('createOfficeCollection', payload);
}

export async function verifyInvestmentFundingRequest(payload) {
  return callFunction('verifyInvestmentFundingRequest', payload);
}

export async function getInvestmentPayouts(userProfile) {
  const role = userProfile?.role;
  const uid = userProfile?.uid;
  if (role === 'admin') {
    const snap = await getDocs(query(payoutsCol, orderBy('expectedDate', 'asc')));
    return mapDocs(snap);
  }
  if (role === 'customer') {
    const snap = await getDocs(query(payoutsCol, where('customerId', '==', uid), orderBy('expectedDate', 'asc')));
    return mapDocs(snap);
  }
  return [];
}

export async function getPayoutsByInvestment(investmentId) {
  const snap = await getDocs(query(
    payoutsCol,
    where('investmentId', '==', investmentId),
    orderBy('expectedDate', 'asc')
  ));
  return mapDocs(snap);
}

export async function approveInvestmentPayout(payload) {
  return callFunction('approveInvestmentPayout', payload);
}

export async function recordInvestmentPayout(payload) {
  return callFunction('recordInvestmentPayout', payload);
}

export async function getReferralCommissionsByCustomer(customerId) {
  const snap = await getDocs(query(
    commissionsCol,
    where('referredCustomerId', '==', customerId),
    orderBy('createdAt', 'desc')
  ));
  return mapDocs(snap);
}
