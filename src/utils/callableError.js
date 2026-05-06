export function getCallableErrorMessage(error, fallback = 'Operation failed') {
  if (!error) return fallback;

  if (typeof error.details === 'string' && error.details.trim()) {
    return error.details.trim();
  }

  if (typeof error.message === 'string' && error.message.trim()) {
    const message = error.message.trim();
    const normalized = message.replace(/^functions\//, '');
    if (!['internal', 'unknown', 'failed-precondition'].includes(normalized)) {
      return message;
    }
  }

  return fallback;
}
