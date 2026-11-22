/**
 * Asks the browser not to evict this site's local data under storage
 * pressure. Returns whether the request was granted, or null when the
 * browser has no such API.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

/** Bytes used and available for this site, or null when unknown. */
export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  if (usage === undefined || quota === undefined) return null;
  return { usage, quota };
}
