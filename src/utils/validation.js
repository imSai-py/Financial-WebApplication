/**
 * Input validation utilities for financial data.
 * Client-side validation for UX — Firestore rules are the real enforcement.
 */

export const validators = {
  /** Helper to validate email format and check for misspelled domains */
  _validateEmail(value, isRequired = false) {
    if (!value || !value.trim()) {
      return isRequired ? 'Email is required' : null;
    }
    const trimmed = value.trim();
    const parts = trimmed.split('@');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return 'Invalid email format';
    }
    const domainPart = parts[1].toLowerCase();
    if (!domainPart.includes('.')) {
      return 'Invalid email domain. Missing top-level domain (e.g., .com)';
    }
    const domainParts = domainPart.split('.');
    const tld = domainParts[domainParts.length - 1];
    if (tld.length < 2) {
      return 'Invalid email domain format';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return 'Invalid email format';
    }

    const typoDomains = {
      'gmal.com': 'gmail.com',
      'gamil.com': 'gmail.com',
      'gmial.com': 'gmail.com',
      'gmaill.com': 'gmail.com',
      'gml.com': 'gmail.com',
      'outlok.com': 'outlook.com',
      'outllok.com': 'outlook.com',
      'otlook.com': 'outlook.com',
      'hotmal.com': 'hotmail.com',
      'hotmial.com': 'hotmail.com',
      'yaho.com': 'yahoo.com',
      'yahooo.com': 'yahoo.com',
    };

    if (typoDomains[domainPart]) {
      return `Misspelled email domain. Did you mean ${typoDomains[domainPart]}?`;
    }
    return null;
  },

  /** Email validation */
  email(value) {
    return this._validateEmail(value, true);
  },

  /** Optional email validation */
  optionalEmail(value) {
    return this._validateEmail(value, false);
  },

  /** Phone validation (Indian format) */
  phone(value) {
    if (!value || !value.trim()) return null; // Optional
    const cleaned = value.replace(/[\s\-()]/g, '');
    const phoneRegex = /^(\+91)?[6-9]\d{9}$/;
    if (!phoneRegex.test(cleaned)) return 'Invalid phone number';
    return null;
  },

  /** Required field */
  required(value, fieldName = 'This field') {
    if (!value || (typeof value === 'string' && !value.trim())) {
      return `${fieldName} is required`;
    }
    return null;
  },

  /** Username validation */
  username(value) {
    if (!value || !value.trim()) return 'Username is required';
    const normalized = value.trim();
    if (normalized.length < 4) return 'Username must be at least 4 characters';
    if (normalized.length > 30) return 'Username must be 30 characters or fewer';
    if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) {
      return 'Username can use letters, numbers, dots, underscores, and hyphens';
    }
    return null;
  },

  /** Password strength */
  password(value) {
    if (!value) return 'Password is required';
    if (value.length < 8) return 'At least 8 characters required';
    if (!/[A-Z]/.test(value)) return 'At least one uppercase letter';
    if (!/[a-z]/.test(value)) return 'At least one lowercase letter';
    if (!/[0-9]/.test(value)) return 'At least one digit';
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value)) return 'At least one special character';
    return null;
  },

  /** Amount validation (positive number input) */
  amount(value) {
    if (value === undefined || value === null || value === '') return 'Amount is required';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return 'Invalid amount';
    if (num <= 0) return 'Amount must be greater than zero';
    if (num > 100000000) return 'Amount exceeds maximum limit';
    // Check for more than 2 decimal places
    const parts = String(value).split('.');
    if (parts[1] && parts[1].length > 2) return 'Maximum 2 decimal places allowed';
    return null;
  },

  /** Commission rate (0-100%) */
  commissionRate(value) {
    if (value === undefined || value === null || value === '') return 'Rate is required';
    const num = parseFloat(value);
    if (isNaN(num)) return 'Invalid rate';
    if (num < 0 || num > 100) return 'Rate must be between 0% and 100%';
    return null;
  },

  /** PAN card validation (Indian format: ABCDE1234F) */
  panNumber(value) {
    if (!value || !value.trim()) return null; // Optional
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    if (!panRegex.test(value.trim().toUpperCase())) return 'Invalid PAN format (e.g., ABCDE1234F)';
    return null;
  },

  /** Aadhaar last 4 digits validation */
  aadhaarLastFour(value) {
    if (!value || !value.trim()) return null; // Optional
    const cleaned = value.trim();
    if (!/^\d{4}$/.test(cleaned)) return 'Enter exactly 4 digits';
    return null;
  },

  /** Date of birth validation (must be 18+) */
  dateOfBirth(value) {
    if (!value) return null; // Optional
    const dob = new Date(value);
    if (isNaN(dob.getTime())) return 'Invalid date';
    const today = new Date();
    const age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate()) ? age - 1 : age;
    if (actualAge < 18) return 'Must be at least 18 years old';
    if (actualAge > 120) return 'Invalid date of birth';
    return null;
  },
};

/**
 * Run multiple validators on a form data object.
 * @param {Object} data - Form data { fieldName: value }
 * @param {Object} rules - Validation rules { fieldName: [validatorFn, ...] }
 * @returns {Object} errors - { fieldName: errorMessage } (empty if valid)
 */
export function validateForm(data, rules) {
  const errors = {};
  for (const [field, validatorFns] of Object.entries(rules)) {
    for (const fn of validatorFns) {
      const error = fn(data[field]);
      if (error) {
        errors[field] = error;
        break; // Stop at first error per field
      }
    }
  }
  return errors;
}

/**
 * Sanitize string input (strip HTML tags)
 */
export function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').trim();
}
