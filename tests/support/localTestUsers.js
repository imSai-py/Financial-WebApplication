const LOCAL_USERS = {
  admin: {
    email: 'admin@dummy.com',
    password: 'Adminpass123@',
    role: 'admin',
  },
  staff: {
    email: 'staff@dummy.com',
    password: 'Staffpass123@',
    role: 'staff',
  },
  agent: {
    email: 'agent@dummy.com',
    password: 'Agentpass123@',
    role: 'agent',
  },
};

const SHARED_USERS = {
  admin: {
    email: 'admin@financeflow.com',
    password: 'Admin@123',
    role: 'admin',
  },
  staff: {
    email: 'staff@financeflow.com',
    password: 'Staff@123',
    role: 'staff',
  },
  agent: {
    email: 'agent@financeflow.com',
    password: 'Agent@123',
    role: 'agent',
  },
};

export const DEFAULT_PLAYWRIGHT_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5000';

export const IS_LOCAL_TEST_ENV =
  (process.env.TEST_USER_PROFILE || 'local') !== 'shared';

export const TEST_USERS = IS_LOCAL_TEST_ENV ? LOCAL_USERS : SHARED_USERS;

