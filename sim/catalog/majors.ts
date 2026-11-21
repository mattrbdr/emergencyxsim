// Major incidents: rare, in phases, each phase a call of its own; some phases
// open with a command decision. Seen from the emergency services' side only:
// statuses, figures and decisions.
import type { Family } from './calls.ts';
import type { Place } from './places.ts';
import type { UnitType } from './units.ts';
import type { MajorChoice } from '../types.ts';

export interface MajorPhase {
  id: string;
  title: string;
  /** What the first report says when the phase opens. */
  brief: string;
  needs: UnitType[];
  /** Game minutes to get the needs on scene. */
  deadline: number;
  /** Game minutes of work once they are. */
  work: number;
  /** Victims to evacuate: fixed, plus the people hurt in earlier phases. */
  victims: number;
  transport: boolean;
  /** A command decision asked when the phase opens; the chosen option sets needs, work and risk. */
  decision?: { report: string; options: MajorChoice[] };
  /** Missing the deadline ends the incident ('abort') or hurts people and goes on ('injured'). */
  onFail: 'abort' | 'injured';
  injuredOnFail: number;
}

export interface MajorKind {
  id: string;
  title: string;
  family: Family;
  level: number;
  /** Where it tends to happen. */
  places: Place[];
  /** Metres of perimeter drawn on the map. */
  perimeter: number;
  alert: string;
  phases: MajorPhase[];
  reward: number;
  xp: number;
}

export const MAJORS: MajorKind[] = [
  {
    id: 'otages', title: 'Braquage avec prise d\'otages', family: 'police', level: 8, places: ['commercial', 'gare'], perimeter: 160,
    alert: 'Alarme agression déclenchée dans une agence bancaire. Coups de feu entendus, des clients sont retenus à l\'intérieur.',
    reward: 18000, xp: 600,
    phases: [
      {
        id: 'bouclage', title: 'Bouclage du périmètre', brief: 'Deux individus armés retranchés dans l\'agence. Il faut boucler la rue et faire évacuer les commerces voisins.',
        needs: ['PS', 'PS'], deadline: 10, work: 6, victims: 0, transport: false, onFail: 'abort', injuredOnFail: 0,
      },
      {
        id: 'resolution', title: 'Résolution', brief: 'Périmètre tenu. Les preneurs d\'otages refusent de sortir.',
        needs: [], deadline: 15, work: 0, victims: 0, transport: false, onFail: 'injured', injuredOnFail: 2,
        decision: {
          report: 'Trois otages, deux preneurs armés, pas de revendication claire. Quelle stratégie ?',
          options: [
            { id: 'negocier', label: 'Négocier', detail: 'Lent, sûr : 85 % de réussite, prime normale', needs: ['PS'], work: 35, success: 0.85, bonus: 1, injuredOnFail: 1 },
            { id: 'bri', label: 'Assaut de la BRI', detail: 'Rapide : 80 % de réussite, prime +40 %', needs: ['BRI'], work: 10, success: 0.8, bonus: 1.4, injuredOnFail: 2 },
            { id: 'bac', label: 'Intervention de la BAC', detail: 'Risqué : 55 % de réussite, prime +15 %', needs: ['BAC', 'BAC'], work: 12, success: 0.55, bonus: 1.15, injuredOnFail: 3 },
          ],
        },
      },
      {
        id: 'otages', title: 'Prise en charge des otages', brief: 'Otages libérés. Bilan et évacuation des victimes.',
        needs: ['VSAV'], deadline: 12, work: 12, victims: 3, transport: true, onFail: 'injured', injuredOnFail: 1,
      },
    ],
  },
];
