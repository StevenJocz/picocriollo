'use client';
import { useEffect, useState } from 'react';
import { DEFAULT_TIME_ZONE } from '../time';

let cached: Promise<string> | undefined;
async function loadZone(): Promise<string> {
  try {
    const response = await fetch('/api/profile', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return DEFAULT_TIME_ZONE;
    const body = await response.json() as { profile?: { timeZone?: string } };
    return body.profile?.timeZone || DEFAULT_TIME_ZONE;
  } catch { return DEFAULT_TIME_ZONE; }
}

/** Zona horaria configurada por la persona (America/Bogota si no hay sesión o preferencia). */
export function useTimeZone(): string {
  const [zone, setZone] = useState(DEFAULT_TIME_ZONE);
  useEffect(() => {
    let active = true;
    cached ??= loadZone();
    void cached.then(value => { if (active) setZone(value); });
    return () => { active = false; };
  }, []);
  return zone;
}

export function resetTimeZoneCache() { cached = undefined; }
