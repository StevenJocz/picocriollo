import type { OperationStatus } from '../../../server/storage/types.ts';

export const OPERATION_LABELS: Record<OperationStatus, string> = {
  solicitud_recibida: 'Solicitud recibida', aceptada: 'Compra aceptada', pago_pendiente: 'Pago pendiente', pago_registrado: 'Pago registrado por el comprador',
  entrega_pendiente: 'Entrega pendiente', entrega_confirmada: 'Entrega confirmada', completada: 'Operación completada', cancelada: 'Cancelada', disputada: 'En disputa',
};

/** Explica en lenguaje claro qué falta; nunca afirma una verificación que la plataforma no hizo. */
export const OPERATION_HINTS: Partial<Record<OperationStatus, string>> = {
  solicitud_recibida: 'Esperando la decisión del vendedor. No se ha cobrado nada.',
  aceptada: 'El ave está reservada. Siguiente paso: acordar el pago.',
  pago_pendiente: 'El comprador debe pagar por el medio acordado y declararlo aquí.',
  pago_registrado: 'El comprador declaró el pago. El vendedor debe confirmar que lo recibió (Pico Criollo no procesa ni verifica pagos).',
  entrega_pendiente: 'Pago confirmado por el vendedor. Falta entregar el ave.',
  entrega_confirmada: 'Entrega registrada. Falta la confirmación final para transferir la propiedad.',
  completada: 'La propiedad del ave se transfirió al comprador.',
  disputada: 'Un moderador revisará el caso. El ave sigue reservada.',
};
