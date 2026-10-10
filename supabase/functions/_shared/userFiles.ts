// Dateien eines Kontos löschen (nur Deno, für admin-log und delete-account). Die Zeilen in der Datenbank gehen beim Löschen des
// Kontos per cascade mit, die Dateien im Speicher nicht, darum vorher hier.

/** Löscht alle Dateien eines Kontos in den privaten Speichern (Ordner {user_id}/). Rückgabe: Zahl der Dateien. */
// deno-lint-ignore no-explicit-any
export async function removeUserFiles(admin: any, userId: string): Promise<number> {
  let n = 0;
  for (const bucket of ['documents', 'worksheets', 'exams']) {
    for (let round = 0; round < 50; round++) {
      const { data, error } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
      if (error || !data || data.length === 0) break;
      const paths = (data as { name: string }[]).map((f) => `${userId}/${f.name}`);
      const { error: rmError } = await admin.storage.from(bucket).remove(paths);
      if (rmError) break;
      n += paths.length;
      if (data.length < 1000) break;
    }
  }
  return n;
}

