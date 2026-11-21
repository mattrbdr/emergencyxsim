// Vehicles: what each one costs, where it is garaged, when it unlocks.
import type { BuildingKind } from './buildings.ts';

export type Service = 'pompiers' | 'samu' | 'police';

export type UnitType =
  | 'VSAV' | 'FPT' | 'PS' | 'VSR' | 'AMB' | 'SMUR' | 'EPA' | 'BAC' | 'VTU' | 'FPTGP' | 'HELI' | 'VPMA' | 'BRI' | 'VPC' | 'CMIC';

export interface UnitDef {
  type: UnitType;
  service: Service;
  /** Short call sign on the map and in lists. */
  label: string;
  long: string;
  building: BuildingKind;
  level: number;
  price: number;
  /** Euros per game hour. */
  upkeep: number;
  /** Multiplier on road speed (a helicopter flies at `flySpeed` instead). */
  speed: number;
  flySpeed?: number;
  /** Can carry a victim to hospital. */
  carries: boolean;
}

export const UNITS: Record<UnitType, UnitDef> = {
  VSAV: { type: 'VSAV', service: 'pompiers', label: 'VSAV', long: 'Véhicule de secours et d\'assistance aux victimes', building: 'caserne', level: 1, price: 18000, upkeep: 120, speed: 1.1, carries: true },
  FPT: { type: 'FPT', service: 'pompiers', label: 'FPT', long: 'Fourgon pompe-tonne', building: 'caserne', level: 2, price: 32000, upkeep: 210, speed: 1.0, carries: false },
  PS: { type: 'PS', service: 'police', label: 'PS', long: 'Police-secours', building: 'police', level: 3, price: 16000, upkeep: 105, speed: 1.15, carries: false },
  VSR: { type: 'VSR', service: 'pompiers', label: 'VSR', long: 'Véhicule de secours routier', building: 'caserne', level: 4, price: 28000, upkeep: 165, speed: 1.05, carries: false },
  AMB: { type: 'AMB', service: 'samu', label: 'AMB', long: 'Ambulance', building: 'hopital', level: 5, price: 14000, upkeep: 90, speed: 1.05, carries: true },
  SMUR: { type: 'SMUR', service: 'samu', label: 'SMUR', long: 'Structure mobile d\'urgence et de réanimation', building: 'hopital', level: 6, price: 30000, upkeep: 240, speed: 1.2, carries: false },
  EPA: { type: 'EPA', service: 'pompiers', label: 'EPA', long: 'Échelle pivotante automatique', building: 'caserne', level: 7, price: 55000, upkeep: 270, speed: 0.85, carries: false },
  BAC: { type: 'BAC', service: 'police', label: 'BAC', long: 'Brigade anti-criminalité', building: 'police', level: 8, price: 22000, upkeep: 135, speed: 1.25, carries: false },
  VTU: { type: 'VTU', service: 'pompiers', label: 'VTU', long: 'Véhicule tous usages', building: 'caserne', level: 9, price: 20000, upkeep: 105, speed: 1.1, carries: false },
  FPTGP: { type: 'FPTGP', service: 'pompiers', label: 'FPTGP', long: 'Fourgon pompe-tonne grande puissance', building: 'caserne', level: 10, price: 70000, upkeep: 330, speed: 0.9, carries: false },
  HELI: { type: 'HELI', service: 'samu', label: 'HÉLI', long: 'Hélicoptère du SAMU', building: 'hopital', level: 11, price: 250000, upkeep: 1200, speed: 1, flySpeed: 60, carries: true },
  BRI: { type: 'BRI', service: 'police', label: 'BRI', long: 'Brigade de recherche et d\'intervention', building: 'police', level: 10, price: 45000, upkeep: 300, speed: 1.2, carries: false },
  VPC: { type: 'VPC', service: 'pompiers', label: 'VPC', long: 'Véhicule poste de commandement', building: 'caserne', level: 9, price: 50000, upkeep: 200, speed: 1.0, carries: false },
  CMIC: { type: 'CMIC', service: 'pompiers', label: 'CMIC', long: 'Cellule mobile d\'intervention chimique', building: 'caserne', level: 10, price: 65000, upkeep: 260, speed: 0.95, carries: false },
  VPMA: { type: 'VPMA', service: 'pompiers', label: 'VPMA', long: 'Véhicule poste médical avancé', building: 'caserne', level: 12, price: 60000, upkeep: 270, speed: 0.95, carries: false },
};

export const UNIT_ORDER = Object.keys(UNITS) as UnitType[];

export const SERVICE_LABEL: Record<Service, string> = { pompiers: 'Sapeurs-pompiers', samu: 'SAMU', police: 'Police' };
