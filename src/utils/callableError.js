const CALLABLE_CODE_MESSAGES = {
  'functions/already-exists': 'A user with this email already exists.',
  'functions/permission-denied': 'You do not have permission to perform this action.',
  'functions/unauthenticated': 'Your session expired. Please sign in again.',
  'functions/not-found': 'The requested record could not be found.',
};

function normalizeCallableCode(code) {
  if (typeof code !== 'string' || !code.trim()) return '';
  const trimmed = code.trim();
  return trimmed.startsWith('functions/') ? trimmed : `functions/${trimmed}`;
}

function extractStringMessage(value) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (value && typeof value === 'object') {
    for (const key of ['message', 'error', 'details']) {
      if (typeof value[key] === 'string' && value[key].trim()) {
        return value[key].trim();
      }
    }
  }

  return '';
}

export function getCallableErrorMessage(error, fallback = 'Operation failed') {
  if (!error) return fallback;

  const detailsMessage = extractStringMessage(error.details);
  if (detailsMessage) {
    return detailsMessage;
  }

  const directMessage = extractStringMessage(error.message);
  if (directMessage) {
    const normalizedDirect = directMessage.replace(/^FirebaseError:\s*/i, '').trim();
    if (normalizedDirect.toLowerCase() === 'failed to fetch') {
      return 'Network request failed before the server responded. Please refresh and try again.';
    }
    if (!['internal', 'unknown', 'failed-precondition', 'functions/internal', 'functions/unknown', 'functions/failed-precondition'].includes(normalizedDirect)) {
      return normalizedDirect;
    }
  }

  const normalizedCode = normalizeCallableCode(error.code);
  if (CALLABLE_CODE_MESSAGES[normalizedCode]) {
    return CALLABLE_CODE_MESSAGES[normalizedCode];
  }

  if (normalizedCode === 'functions/failed-precondition') {
    return 'This action could not be completed in the current state. Please refresh and try again.';
  }

  if (normalizedCode === 'functions/invalid-argument') {
    return 'Some of the submitted values are invalid. Please review the form and try again.';
  }

  return fallback;
}
