import { describe, expect, it } from 'vitest';
import { germanAuthError, MIN_PASSWORD, passwordProblem } from './accounts';

describe('passwordProblem', () => {
  it('zu kurz', () => {
    expect(passwordProblem('a'.repeat(MIN_PASSWORD - 1), 'a'.repeat(MIN_PASSWORD - 1))).toContain('mindestens');
    expect(passwordProblem('', '')).toContain('mindestens');
  });
  it('Wiederholung stimmt nicht', () => {
    expect(passwordProblem('passwort123', 'passwort124')).toContain('nicht gleich');
  });
  it('passt', () => {
    expect(passwordProblem('passwort123', 'passwort123')).toBeNull();
    expect(passwordProblem('a'.repeat(MIN_PASSWORD), 'a'.repeat(MIN_PASSWORD))).toBeNull();
  });
});

describe('germanAuthError', () => {
  it('übersetzt bekannte Meldungen', () => {
    expect(germanAuthError('Invalid login credentials')).toBe('E-Mail oder Passwort stimmt nicht.');
    expect(germanAuthError('New password should be different from the old password.')).toContain('unterscheiden');
    expect(germanAuthError('Password should be at least 6 characters')).toContain('zu kurz');
    expect(germanAuthError('Token has expired or is invalid')).toContain('abgelaufen');
    expect(germanAuthError('PKCE code verifier not found in storage')).toContain('selben Browser');
    expect(germanAuthError('For security purposes, you can only request this after 20 seconds')).toContain('Zu viele');
  });
  it('lässt Unbekanntes unverändert', () => {
    expect(germanAuthError('Etwas ganz anderes')).toBe('Etwas ganz anderes');
  });
});
