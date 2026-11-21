// Station upgrades: bought once per building, each changes one rule for the
// crews and vehicles based there (or, for a few, for the whole service).
import type { BuildingKind } from './buildings.ts';

export type UpgradeId =
  | 'dortoir' | 'atelier' | 'garde' | 'brules' | 'formation' | 'trauma' | 'heliport'
  | 'manoeuvre' | 'chenil' | 'salle_crise' | 'pharmacie' | 'centre_ops';

export interface UpgradeDef {
  id: UpgradeId;
  kinds: BuildingKind[];
  label: string;
  /** What it does, as the shop says it. */
  detail: string;
  level: number;
  price: number;
  /** Euros per game hour. */
  upkeep: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'dortoir', kinds: ['caserne', 'police'], label: 'Dortoir', detail: 'Les équipages récupèrent deux fois plus vite à la base.', level: 4, price: 25000, upkeep: 30 },
  { id: 'atelier', kinds: ['caserne', 'police'], label: 'Atelier mécanique', detail: 'Deux fois moins de pannes, réparations deux fois plus rapides, révisions à moitié prix.', level: 5, price: 35000, upkeep: 40 },
  { id: 'garde', kinds: ['caserne', 'police'], label: 'Salle de garde', detail: 'Départ en 15 s au lieu d\'une minute.', level: 6, price: 30000, upkeep: 40 },
  { id: 'brules', kinds: ['hopital'], label: 'Service des grands brûlés', detail: 'Victimes d\'incendie : soins facturés ×1,5 et réputation en hausse.', level: 7, price: 120000, upkeep: 150 },
  { id: 'formation', kinds: ['caserne'], label: 'Centre de formation', detail: '+10 points de réussite quand vos équipages font avec les moyens présents.', level: 8, price: 60000, upkeep: 60 },
  { id: 'trauma', kinds: ['hopital'], label: 'Centre de traumatologie', detail: 'Victimes de la route : soins facturés ×1,5, véhicules libérés plus vite.', level: 9, price: 150000, upkeep: 180 },
  { id: 'heliport', kinds: ['hopital'], label: 'Héliport', detail: 'Deux places de plus, pour l\'hélicoptère et les véhicules médicaux.', level: 11, price: 90000, upkeep: 100 },
  { id: 'manoeuvre', kinds: ['caserne'], label: 'Tour de manœuvre', detail: 'Les équipages entraînés travaillent 15 % plus vite sur intervention.', level: 14, price: 80000, upkeep: 70 },
  { id: 'chenil', kinds: ['police'], label: 'Chenil et salle tactique', detail: 'Les équipages de police travaillent 15 % plus vite sur intervention.', level: 16, price: 70000, upkeep: 60 },
  { id: 'salle_crise', kinds: ['caserne', 'police'], label: 'Salle de crise', detail: '+10 points de réussite sur toutes les décisions de commandement des crises.', level: 18, price: 200000, upkeep: 160 },
  { id: 'pharmacie', kinds: ['hopital'], label: 'Pharmacie centrale', detail: 'Les véhicules repartent des urgences 30 % plus vite.', level: 20, price: 70000, upkeep: 60 },
  { id: 'centre_ops', kinds: ['caserne', 'police'], label: 'Centre opérationnel', detail: 'Toutes les situations tiennent 2 minutes de plus avant de s\'aggraver.', level: 24, price: 300000, upkeep: 250 },
];

export const UPGRADE = Object.fromEntries(UPGRADES.map((u) => [u.id, u])) as Record<UpgradeId, UpgradeDef>;
