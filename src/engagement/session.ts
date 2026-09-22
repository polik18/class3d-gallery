import type { StringStorage } from '../exhibition/settings.ts';

export const VISITOR_SESSION_KEY = 'class3d-gallery:visitor-session:v1';

export function getVisitorSession(storage: StringStorage = sessionStorage, uuid: () => string = crypto.randomUUID) {
  const existing = storage.getItem(VISITOR_SESSION_KEY);
  if (existing) return existing;
  const created = uuid();
  storage.setItem(VISITOR_SESSION_KEY, created);
  return created;
}

export function startNewVisitorSession(storage: StringStorage = sessionStorage, uuid: () => string = crypto.randomUUID) {
  const created = uuid();
  storage.setItem(VISITOR_SESSION_KEY, created);
  return created;
}
