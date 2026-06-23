import { describe, expect, it } from 'vitest';
import { validators } from '../../src/utils/validation';

describe('validators.email', () => {
  it('rejects empty and null values when required', () => {
    expect(validators.email('')).toBe('Email is required');
    expect(validators.email(null)).toBe('Email is required');
    expect(validators.email(undefined)).toBe('Email is required');
  });

  it('validates standard correct emails', () => {
    expect(validators.email('test@example.com')).toBeNull();
    expect(validators.email('user.name+tag@domain.org')).toBeNull();
    expect(validators.email('first@sub.domain.co.in')).toBeNull();
  });

  it('rejects invalid email formats', () => {
    expect(validators.email('plain_address')).toBe('Invalid email format');
    expect(validators.email('missing_domain@')).toBe('Invalid email format');
    expect(validators.email('@missing_local.com')).toBe('Invalid email format');
    expect(validators.email('two@@dots.com')).toBe('Invalid email format');
  });

  it('rejects domains missing a top-level domain (TLD)', () => {
    expect(validators.email('test123@gmail')).toBe('Invalid email domain. Missing top-level domain (e.g., .com)');
    expect(validators.email('hello@yahoo.')).toBe('Invalid email domain format');
  });

  it('rejects invalid TLD format', () => {
    expect(validators.email('abc@domain.c')).toBe('Invalid email domain format');
  });

  it('detects and rejects misspelled domains', () => {
    expect(validators.email('test@gmal.com')).toBe('Misspelled email domain. Did you mean gmail.com?');
    expect(validators.email('abc@outlok.com')).toBe('Misspelled email domain. Did you mean outlook.com?');
    expect(validators.email('user@gamil.com')).toBe('Misspelled email domain. Did you mean gmail.com?');
    expect(validators.email('user@hotmal.com')).toBe('Misspelled email domain. Did you mean hotmail.com?');
  });
});

describe('validators.optionalEmail', () => {
  it('allows empty and null values when optional', () => {
    expect(validators.optionalEmail('')).toBeNull();
    expect(validators.optionalEmail(null)).toBeNull();
    expect(validators.optionalEmail(undefined)).toBeNull();
  });

  it('validates and rejects misspelled domains even if optional', () => {
    expect(validators.optionalEmail('test@gmal.com')).toBe('Misspelled email domain. Did you mean gmail.com?');
    expect(validators.optionalEmail('test123@gmail')).toBe('Invalid email domain. Missing top-level domain (e.g., .com)');
    expect(validators.optionalEmail('valid@example.com')).toBeNull();
  });
});
