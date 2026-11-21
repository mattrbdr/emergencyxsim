// Radio statuses, numbered as crews give them on the air.
import type { UnitStatus } from '../types.ts';

export const STATUS: Record<UnitStatus, { code: number; label: string }> = {
  dispo: { code: 1, label: 'Disponible' },
  route: { code: 2, label: 'Parti' },
  surplace: { code: 3, label: 'Sur les lieux' },
  transport: { code: 4, label: 'Transport' },
  hopital: { code: 5, label: 'À l\'hôpital' },
  retour: { code: 6, label: 'Retour' },
  repos: { code: 7, label: 'Repos' },
  atelier: { code: 8, label: 'Atelier' },
};
