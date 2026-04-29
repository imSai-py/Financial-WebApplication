/**
 * Format a Firestore Timestamp or Date to a readable string.
 */
export function formatDate(timestamp, options = {}) {
  if (!timestamp) return '—';

  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  
  const defaults = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  };

  return new Intl.DateTimeFormat('en-IN', defaults).format(date);
}

/**
 * Format date with time
 */
export function formatDateTime(timestamp) {
  return formatDate(timestamp, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Relative time (e.g., "2 hours ago")
 */
export function timeAgo(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'week', seconds: 604800 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 },
  ];

  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds);
    if (count >= 1) return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
  }
  return 'Just now';
}
