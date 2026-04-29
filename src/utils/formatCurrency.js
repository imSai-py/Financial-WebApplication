/**
 * Currency utilities with integer precision.
 * All monetary values are stored as integer PAISE (cents) in Firestore.
 * Conversion to display format happens only at the UI layer.
 */

/**
 * Convert a human-readable amount (e.g., 2500.75) to integer paise/cents.
 * @param {number|string} amount - Display amount (e.g., 2500.75)
 * @returns {number} Integer paise (e.g., 250075)
 */
export function toCents(amount) {
  if (amount === null || amount === undefined || amount === '') return 0;
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Convert integer paise/cents back to a decimal number.
 * @param {number} cents - Integer paise (e.g., 250075)
 * @returns {number} Decimal amount (e.g., 2500.75)
 */
export function fromCents(cents) {
  if (!cents || isNaN(cents)) return 0;
  return cents / 100;
}

/**
 * Format integer paise to a localized currency string.
 * @param {number} amountInCents - Amount in paise/cents
 * @param {string} currency - ISO currency code (default: INR)
 * @returns {string} Formatted string (e.g., "₹2,500.75")
 */
export function formatCurrency(amountInCents, currency = 'INR') {
  const amount = fromCents(amountInCents);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a raw decimal number as currency (no cents conversion).
 * Use this ONLY for display values that are already in decimal format.
 * @param {number} amount - Decimal amount
 * @param {string} currency - ISO currency code
 */
export function formatAmount(amount, currency = 'INR') {
  if (amount === null || amount === undefined || isNaN(amount)) {
    amount = 0;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a compact number (e.g., 1.2K, 3.5L, 1.2Cr)
 * @param {number} num - The number to format
 * @returns {string} Compact formatted string
 */
export function formatCompact(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
  return `₹${num.toFixed(2)}`;
}
