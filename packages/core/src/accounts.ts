/** Deutsche Meldungen für Fehler der Supabase-Anmeldung. */
export function germanAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-Mail oder Passwort stimmt nicht.';
  if (m.includes('email not confirmed')) return 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link in der Bestätigungsmail.';
  if (m.includes('already registered')) return 'Zu dieser E-Mail-Adresse gibt es schon ein Konto. Melde dich an.';
  if (m.includes('different from the old password')) return 'Das neue Passwort muss sich vom alten unterscheiden.';
  if (m.includes('password should be') || m.includes('weak password')) return 'Das Passwort ist zu kurz oder zu einfach.';
  if (m.includes('rate limit') || m.includes('security purposes')) return 'Zu viele Versuche. Warte kurz und probiere es noch einmal.';
  if (m.includes('code verifier')) return 'Öffne den Link im selben Browser, in dem du ihn angefordert hast, oder nutze den Code aus der E-Mail.';
  if (m.includes('expired') || m.includes('invalid') || m.includes('otp')) return 'Der Link oder Code ist abgelaufen oder falsch. Fordere einen neuen an.';
  return message;
}

export const MIN_PASSWORD = 8;

/** Prüft ein neues Passwort samt Wiederholung. Gibt eine Meldung zurück oder null, wenn alles passt. */
export function passwordProblem(password: string, repeat: string): string | null {
  if (password.length < MIN_PASSWORD) return `Das Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.`;
  if (password !== repeat) return 'Die beiden Passwörter sind nicht gleich.';
  return null;
}
