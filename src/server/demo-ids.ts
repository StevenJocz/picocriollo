// Ids fijos de las cuentas de muestra. Deben ser UUID: en PostgreSQL app_users.id, app_sessions.user_id y farm_data.user_id son uuid,
// y un id como «demo-social-roble» hacía fallar el alta de cuentas con un 503. Sin imports: lo usan servidor, servicios y pruebas.
export const DEMO_USER_IDS = {
  roble: '00000000-0000-4000-8000-00000000d001',
  semilla: '00000000-0000-4000-8000-00000000d002',
  montana: '00000000-0000-4000-8000-00000000d003',
} as const;

/** Ids de muestra de versiones anteriores (no UUID): se limpian al sincronizar. */
export const LEGACY_DEMO_USER_IDS = ['demo-social-roble', 'demo-social-semilla', 'demo-social-montana'] as const;
