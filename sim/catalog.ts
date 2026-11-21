// What the game knows about services, vehicles and the calls people make.
import type { PoiKind } from './city.ts';

export type Service = 'pompiers' | 'samu' | 'police';
export type UnitType = 'FPT' | 'VSAV' | 'EPA' | 'SMUR' | 'AMB' | 'PS' | 'BAC';

export const UNIT_TYPES: Record<UnitType, { service: Service; label: string; long: string; speed: number; cost: number }> = {
  FPT: { service: 'pompiers', label: 'FPT', long: 'Fourgon pompe-tonne', speed: 1.0, cost: 420 },
  VSAV: { service: 'pompiers', label: 'VSAV', long: 'Secours et assistance aux victimes', speed: 1.1, cost: 180 },
  EPA: { service: 'pompiers', label: 'EPA', long: 'Échelle pivotante automatique', speed: 0.85, cost: 520 },
  SMUR: { service: 'samu', label: 'SMUR', long: 'Équipe médicale d\'urgence', speed: 1.2, cost: 650 },
  AMB: { service: 'samu', label: 'AMB', long: 'Ambulance', speed: 1.05, cost: 150 },
  PS: { service: 'police', label: 'PS', long: 'Police-secours', speed: 1.15, cost: 120 },
  BAC: { service: 'police', label: 'BAC', long: 'Brigade anti-criminalité', speed: 1.25, cost: 160 },
};

export const SERVICE_LABEL: Record<Service, string> = { pompiers: 'Pompiers', samu: 'SAMU', police: 'Police' };
export const POI_SERVICE: Record<PoiKind, Service> = { fire: 'pompiers', hospital: 'samu', police: 'police' };

/** The fleet each kind of station starts the shift with, in order of stations. */
export const FLEET: Record<PoiKind, UnitType[][]> = {
  fire: [['FPT', 'FPT', 'VSAV', 'VSAV', 'EPA'], ['FPT', 'VSAV', 'VSAV'], ['FPT', 'VSAV', 'EPA'], ['FPT', 'VSAV']],
  hospital: [['SMUR', 'AMB', 'AMB'], ['SMUR', 'AMB'], ['AMB']],
  police: [['PS', 'PS', 'BAC'], ['PS', 'PS'], ['PS']],
};

export type Family = 'feu' | 'sap' | 'police' | 'mixte';
export const FAMILY_LABEL: Record<Family, string> = {
  feu: 'Incendie', sap: 'Secours à personne', police: 'Police', mixte: 'Accident / mixte',
};

export interface CallKind {
  id: string;
  family: Family;
  title: string;
  priority: 1 | 2 | 3;
  needs: UnitType[];
  /** Minutes (game) before the situation degrades. */
  deadline: number;
  /** Minutes (game) of work once every need is on scene. */
  work: number;
  victims: number;
  /** The victim goes to hospital in the first VSAV/AMB on scene. */
  transport: boolean;
  /** A fire that is not attacked in time spreads: these join the needs. */
  escalate?: UnitType[];
  weight: number;
  callers: string[];
}

export const CALL_KINDS: CallKind[] = [
  {
    id: 'feu_poubelle', family: 'feu', title: 'Feu de poubelles', priority: 3, needs: ['FPT'], deadline: 25, work: 12,
    victims: 0, transport: false, weight: 6,
    callers: ['Il y a des flammes dans le local à poubelles en bas de chez moi, ça fume beaucoup.', 'Les containers brûlent sur le trottoir, ça commence à toucher une voiture garée.'],
  },
  {
    id: 'feu_voiture', family: 'feu', title: 'Feu de véhicule', priority: 2, needs: ['FPT'], deadline: 18, work: 15,
    victims: 0, transport: false, escalate: ['FPT'], weight: 5,
    callers: ['Une voiture est en feu au milieu de la rue, il y a de la fumée noire !', 'Le moteur de ma voiture a pris feu, je suis sorti mais ça brûle fort.'],
  },
  {
    id: 'feu_appart', family: 'feu', title: 'Feu d\'appartement', priority: 1, needs: ['FPT', 'EPA', 'VSAV'], deadline: 14, work: 30,
    victims: 1, transport: true, escalate: ['FPT'], weight: 4,
    callers: ['De la fumée sort des fenêtres du 4e étage, quelqu\'un crie au balcon !', 'Ça sent le brûlé dans l\'immeuble et je vois des flammes chez la voisine du dessus.'],
  },
  {
    id: 'malaise', family: 'sap', title: 'Malaise sur la voie publique', priority: 2, needs: ['VSAV'], deadline: 20, work: 12,
    victims: 1, transport: true, weight: 10,
    callers: ['Un homme s\'est effondré devant la boulangerie, il respire mais ne répond pas bien.', 'Une dame a fait un malaise à l\'arrêt de bus, elle est très pâle.'],
  },
  {
    id: 'arret', family: 'sap', title: 'Arrêt cardio-respiratoire', priority: 1, needs: ['VSAV', 'SMUR'], deadline: 10, work: 25,
    victims: 1, transport: true, weight: 4,
    callers: ['Mon mari ne respire plus ! Il est tombé d\'un coup, je fais quoi ?!', 'Un joggeur est par terre, il ne bouge plus, quelqu\'un fait un massage.'],
  },
  {
    id: 'chute', family: 'sap', title: 'Chute de personne âgée', priority: 3, needs: ['AMB'], deadline: 35, work: 10,
    victims: 1, transport: true, weight: 7,
    callers: ['Ma grand-mère est tombée dans sa cuisine, elle a très mal à la hanche.', 'Mon voisin de 85 ans est par terre depuis ce matin, il n\'arrive pas à se relever.'],
  },
  {
    id: 'detresse', family: 'sap', title: 'Détresse respiratoire', priority: 1, needs: ['VSAV', 'SMUR'], deadline: 12, work: 18,
    victims: 1, transport: true, weight: 3,
    callers: ['Mon fils fait une crise d\'asthme très forte, son inhalateur ne marche pas.', 'Elle n\'arrive plus à respirer, ses lèvres deviennent bleues !'],
  },
  {
    id: 'cambriolage', family: 'police', title: 'Cambriolage en cours', priority: 2, needs: ['PS'], deadline: 12, work: 15,
    victims: 0, transport: false, weight: 6,
    callers: ['J\'entends quelqu\'un forcer la porte de l\'appartement d\'en face, ils sont deux.', 'Il y a des gens avec des lampes dans la maison des voisins qui sont en vacances.'],
  },
  {
    id: 'rixe', family: 'police', title: 'Rixe sur la voie publique', priority: 1, needs: ['PS', 'BAC', 'VSAV'], deadline: 10, work: 18,
    victims: 1, transport: true, weight: 3,
    callers: ['Une bagarre éclate devant le bar, il y en a un qui saigne beaucoup !', 'Ils sont une dizaine à se battre, il y a des bouteilles cassées.'],
  },
  {
    id: 'vol', family: 'police', title: 'Vol à l\'arraché', priority: 3, needs: ['BAC'], deadline: 15, work: 10,
    victims: 0, transport: false, weight: 5,
    callers: ['On vient de m\'arracher mon sac, le type est parti en scooter vers le centre !', 'Un jeune a volé le téléphone d\'une dame et s\'enfuit en courant.'],
  },
  {
    id: 'differend', family: 'police', title: 'Différend familial', priority: 2, needs: ['PS'], deadline: 18, work: 20,
    victims: 0, transport: false, weight: 4,
    callers: ['Ça hurle chez les voisins depuis une heure, j\'ai entendu des objets se casser.', 'Mon ex refuse de partir et me menace, j\'ai peur.'],
  },
  {
    id: 'avp', family: 'mixte', title: 'Accident de la circulation', priority: 2, needs: ['VSAV', 'PS'], deadline: 16, work: 18,
    victims: 1, transport: true, weight: 6,
    callers: ['Accrochage entre une voiture et un scooter, le conducteur du scooter est au sol.', 'Une voiture a percuté un poteau, le conducteur saigne du front.'],
  },
  {
    id: 'avp_grave', family: 'mixte', title: 'Accident grave, victime incarcérée', priority: 1, needs: ['FPT', 'VSAV', 'SMUR', 'PS'], deadline: 12, work: 35,
    victims: 2, transport: true, weight: 2,
    callers: ['Deux voitures en face à face, quelqu\'un est coincé dans l\'habitacle et ne répond plus !', 'Un camion a écrasé une voiture au carrefour, il y a des gens bloqués dedans.'],
  },
];

export const STATUS_LABEL: Record<string, string> = {
  dispo: 'Disponible', route: 'En route', surplace: 'Sur place', transport: 'Transport', hopital: 'À l\'hôpital', retour: 'Retour',
};
