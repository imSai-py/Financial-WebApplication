import { describe, expect, it } from 'vitest';
import { getCallableErrorMessage } from '../../src/utils/callableError';

describe('getCallableErrorMessage', () => {
  it('returns details string when available', () => {
    expect(
      getCallableErrorMessage({
        code: 'functions/internal',
        details: 'A user with this email already exists.',
      }, 'Fallback')
    ).toBe('A user with this email already exists.');
  });

  it('returns normalized direct message when Firebase supplies one', () => {
    expect(
      getCallableErrorMessage({
        code: 'functions/already-exists',
        message: 'FirebaseError: A user with this email already exists.',
      }, 'Fallback')
    ).toBe('A user with this email already exists.');
  });

  it('maps generic callable codes to friendly messages', () => {
    expect(
      getCallableErrorMessage({
        code: 'functions/permission-denied',
        message: 'functions/permission-denied',
      }, 'Fallback')
    ).toBe('You do not have permission to perform this action.');
  });

  it('uses a friendly failed-precondition fallback', () => {
    expect(
      getCallableErrorMessage({
        code: 'functions/failed-precondition',
        message: 'functions/failed-precondition',
      }, 'Fallback')
    ).toBe('This action could not be completed in the current state. Please refresh and try again.');
  });
});
