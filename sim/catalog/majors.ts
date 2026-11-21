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
  {
    id: 'tour', title: 'Feu de tour d\'habitation', family: 'feu', level: 7, places: ['commercial'], perimeter: 200,
    alert: 'Feu au 9e étage d\'une tour de 15 niveaux. La fumée envahit la cage d\'escalier, plusieurs appels de résidents bloqués.',
    reward: 16000, xp: 520,
    phases: [
      {
        id: 'attaque', title: 'Reconnaissance et attaque', brief: 'Feu d\'appartement au 9e, propagation par les fenêtres. Établir les lances et l\'échelle.',
        needs: ['FPT', 'FPT', 'EPA'], deadline: 12, work: 15, victims: 0, transport: false, onFail: 'injured', injuredOnFail: 2,
      },
      {
        id: 'etages', title: 'Étages supérieurs', brief: 'Le feu est contenu au 9e mais les étages au-dessus sont enfumés.',
        needs: [], deadline: 15, work: 0, victims: 0, transport: false, onFail: 'injured', injuredOnFail: 3,
        decision: {
          report: 'Une trentaine de résidents sont bloqués entre le 10e et le 15e. Comment procéder ?',
          options: [
            { id: 'echelles', label: 'Évacuation par les échelles', detail: '85 % de réussite, prime +20 %', needs: ['EPA'], work: 25, success: 0.85, bonus: 1.2, injuredOnFail: 2 },
            { id: 'abri', label: 'Confinement dans les logements', detail: 'Moins de moyens : 70 % de réussite', needs: ['FPT'], work: 20, success: 0.7, bonus: 1, injuredOnFail: 3 },
            { id: 'fptgp', label: 'Renfort grande puissance', detail: '90 % de réussite, prime +30 %', needs: ['FPTGP'], work: 15, success: 0.9, bonus: 1.3, injuredOnFail: 1 },
          ],
        },
      },
      {
        id: 'victimes', title: 'Prise en charge des intoxiqués', brief: 'Résidents évacués, plusieurs intoxiqués par les fumées.',
        needs: ['VSAV', 'VSAV', 'SMUR'], deadline: 12, work: 15, victims: 4, transport: true, onFail: 'injured', injuredOnFail: 2,
      },
    ],
  },
  {
    id: 'gaz_effondrement', title: 'Explosion de gaz, immeuble effondré', family: 'technique', level: 9, places: [], perimeter: 220,
    alert: 'Forte explosion entendue dans tout le quartier. Un immeuble de quatre étages s\'est en partie effondré.',
    reward: 22000, xp: 700,
    phases: [
      {
        id: 'securite', title: 'Coupure du gaz et périmètre', brief: 'Odeur de gaz persistante, risque de seconde explosion. Couper l\'alimentation et éloigner le public.',
        needs: ['FPT', 'VTU', 'PS'], deadline: 10, work: 10, victims: 0, transport: false, onFail: 'injured', injuredOnFail: 3,
      },
      {
        id: 'recherche', title: 'Recherche de victimes', brief: 'Gaz coupé. Des voix sous les décombres.',
        needs: [], deadline: 15, work: 0, victims: 0, transport: false, onFail: 'injured', injuredOnFail: 3,
        decision: {
          report: 'Au moins trois personnes sous les gravats. La structure reste instable. Quelle méthode ?',
          options: [
            { id: 'deblaiement', label: 'Déblaiement prudent', detail: 'Long et sûr : 85 % de réussite', needs: ['VTU', 'FPT'], work: 40, success: 0.85, bonus: 1, injuredOnFail: 2 },
            { id: 'epa', label: 'Sauvetage rapide par l\'échelle', detail: 'Rapide : 60 % de réussite, prime +30 %', needs: ['EPA'], work: 20, success: 0.6, bonus: 1.3, injuredOnFail: 3 },
            { id: 'vpc', label: 'Engager un poste de commandement', detail: '90 % de réussite, prime +25 %', needs: ['VPC', 'VTU'], work: 25, success: 0.9, bonus: 1.25, injuredOnFail: 1 },
          ],
        },
      },
      {
        id: 'victimes', title: 'Évacuation des victimes', brief: 'Victimes dégagées, polytraumatismes.',
        needs: ['VSAV', 'VSAV', 'SMUR'], deadline: 12, work: 18, victims: 3, transport: true, onFail: 'injured', injuredOnFail: 2,
      },
    ],
  },
  {
    id: 'violences', title: 'Violences urbaines', family: 'police', level: 9, places: ['commercial', 'gare'], perimeter: 400,
    alert: 'Plusieurs groupes affrontent les forces de l\'ordre. Des véhicules et des poubelles sont incendiés dans tout le secteur.',
    reward: 15000, xp: 520,
    phases: [
      {
        id: 'secteur', title: 'Sécurisation du secteur', brief: 'Des barricades sont dressées. Il faut reprendre le contrôle des carrefours.',
        needs: ['PS', 'PS', 'BAC'], deadline: 12, work: 20, victims: 0, transport: false, onFail: 'abort', injuredOnFail: 0,
      },
      {
        id: 'feux', title: 'Feux de véhicules en série', brief: 'Une dizaine de voitures brûlent. Les engins sont caillassés à leur arrivée.',
        needs: [], deadline: 15, work: 0, victims: 0, transport: false, onFail: 'injured', injuredOnFail: 2,
        decision: {
          report: 'Les pompiers ne peuvent pas travailler sous les projectiles. Comment les engager ?',
          options: [
            { id: 'escorte', label: 'Sous escorte de la police', detail: '85 % de réussite, prime normale', needs: ['FPT', 'PS'], work: 20, success: 0.85, bonus: 1, injuredOnFail: 1 },
            { id: 'attendre', label: 'Attendre le retour au calme', detail: 'Sûr mais lent : 90 % de réussite, prime −20 %', needs: ['FPT'], work: 45, success: 0.9, bonus: 0.8, injuredOnFail: 1 },
            { id: 'direct', label: 'Engager sans escorte', detail: 'Rapide : 50 % de réussite, des pompiers exposés', needs: ['FPT', 'FPT'], work: 15, success: 0.5, bonus: 1.1, injuredOnFail: 3 },
          ],
        },
      },
      {
        id: 'blesses', title: 'Prise en charge des blessés', brief: 'Le calme revient. Plusieurs blessés légers et un blessé grave.',
        needs: ['VSAV', 'VSAV'], deadline: 12, work: 12, victims: 2, transport: true, onFail: 'injured', injuredOnFail: 1,
      },
    ],
  },
  {
    id: 'inondation_eclair', title: 'Inondation éclair', family: 'technique', level: 9, places: ['parc'], perimeter: 450,
    alert: 'Orage violent : la rivière déborde, des rues entières sont sous l\'eau, des véhicules sont emportés.',
    reward: 14000, xp: 480,
    phases: [
      {
        id: 'reconnaissance', title: 'Reconnaissance des zones inondées', brief: 'Plusieurs rues coupées. Repérer les personnes isolées.',
        needs: ['VTU', 'PS'], deadline: 12, work: 12, victims: 0, transport: false, onFail: 'injured', injuredOnFail: 2,
      },
      {
        id: 'pompage', title: 'Pompage et mise en sécurité', brief: 'Caves et parkings noyés, un transformateur est menacé.',
        needs: ['VTU', 'VTU', 'FPT'], deadline: 15, work: 25, victims: 0, transport: false, onFail: 'injured', injuredOnFail: 1,
      },
      {
        id: 'isoles', title: 'Personnes isolées', brief: 'Deux personnes sur le toit de leur voiture, une autre réfugiée à l\'étage.',
        needs: ['VSAV', 'EPA'], deadline: 12, work: 15, victims: 2, transport: true, onFail: 'injured', injuredOnFail: 2,
      },
    ],
  },
  {
    id: 'seveso', title: 'Feu d\'usine à risque', family: 'feu', level: 10, places: ['industriel'], perimeter: 600,
    alert: 'Incendie dans une usine classée à risque. Un panache de fumée épaisse se dirige vers les habitations.',
    reward: 26000, xp: 800,
    phases: [
      {
        id: 'attaque', title: 'Attaque du feu', brief: 'Cuves de solvant exposées au feu. Refroidir avant tout.',
        needs: ['FPTGP', 'FPT', 'FPT'], deadline: 12, work: 25, victims: 0, transport: false, onFail: 'injured', injuredOnFail: 3,
      },
      {
        id: 'panache', title: 'Panache toxique', brief: 'Le vent pousse la fumée sur trois quartiers.',
        needs: [], deadline: 15, work: 0, victims: 0, transport: false, onFail: 'injured', injuredOnFail: 4,
        decision: {
          report: 'Fumées irritantes sous le vent, mesures en cours. Que décider pour la population ?',
          options: [
            { id: 'confinement', label: 'Confinement des habitants', detail: '80 % de réussite, prime normale', needs: ['PS', 'PS'], work: 30, success: 0.8, bonus: 1, injuredOnFail: 3 },
            { id: 'evacuation', label: 'Évacuation des quartiers', detail: '90 % de réussite, prime +20 %', needs: ['PS', 'PS', 'BAC'], work: 40, success: 0.9, bonus: 1.2, injuredOnFail: 2 },
            { id: 'cmic', label: 'Mesures par la cellule chimique', detail: '90 % de réussite, prime +30 %', needs: ['CMIC'], work: 20, success: 0.9, bonus: 1.3, injuredOnFail: 2 },
          ],
        },
      },
      {
        id: 'intoxiques', title: 'Prise en charge des intoxiqués', brief: 'Employés et riverains présentent des difficultés respiratoires.',
        needs: ['VSAV', 'VSAV', 'SMUR'], deadline: 12, work: 18, victims: 4, transport: true, onFail: 'injured', injuredOnFail: 2,
      },
    ],
  },
  {
    id: 'attentat', title: 'Attentat dans un lieu fréquenté', family: 'police', level: 11, places: ['gare', 'stade', 'commercial'], perimeter: 350,
    alert: 'Explosion et coups de feu signalés dans un lieu très fréquenté. Nombreux appels, mouvement de foule.',
    reward: 40000, xp: 1200,
    phases: [
      {
        id: 'exclusion', title: 'Zone d\'exclusion', brief: 'Menace toujours active. Aucun secours ne peut entrer avant la sécurisation par les forces de l\'ordre.',
        needs: ['BRI', 'PS', 'PS'], deadline: 10, work: 12, victims: 0, transport: false, onFail: 'injured', injuredOnFail: 4,
      },
      {
        id: 'plan_rouge', title: 'Plan rouge', brief: 'Zone sécurisée. Afflux de victimes, le plan blanc est déclenché dans les hôpitaux.',
        needs: [], deadline: 15, work: 0, victims: 0, transport: false, onFail: 'injured', injuredOnFail: 4,
        decision: {
          report: 'Une vingtaine de victimes, dont plusieurs en urgence absolue. Comment organiser les secours ?',
          options: [
            { id: 'pc', label: 'Poste de commandement et tri', detail: '85 % de réussite, prime +30 %', needs: ['VPC', 'VSAV', 'VSAV'], work: 30, success: 0.85, bonus: 1.3, injuredOnFail: 3 },
            { id: 'direct', label: 'Évacuations au fil de l\'eau', detail: '70 % de réussite, prime normale', needs: ['VSAV', 'VSAV', 'SMUR'], work: 25, success: 0.7, bonus: 1, injuredOnFail: 5 },
          ],
        },
      },
      {
        id: 'evacuation', title: 'Évacuation vers les hôpitaux', brief: 'Les victimes triées partent vers les hôpitaux de la ville.',
        needs: ['VSAV', 'VSAV', 'SMUR', 'AMB'], deadline: 15, work: 25, victims: 6, transport: true, onFail: 'injured', injuredOnFail: 3,
      },
    ],
  },
  {
    id: 'ferroviaire', title: 'Accident ferroviaire', family: 'route', level: 12, places: ['gare'], perimeter: 500,
    alert: 'Un train régional a percuté un poids lourd à un passage à niveau. Deux voitures ont déraillé.',
    reward: 38000, xp: 1100,
    phases: [
      {
        id: 'voies', title: 'Sécurisation des voies', brief: 'Le trafic doit être interrompu et la caténaire coupée avant d\'approcher.',
        needs: ['PS', 'VTU'], deadline: 10, work: 10, victims: 0, transport: false, onFail: 'injured', injuredOnFail: 3,
      },
      {
        id: 'desincarceration', title: 'Désincarcération', brief: 'Des voyageurs sont coincés dans les voitures couchées.',
        needs: ['VSR', 'FPT', 'VPMA'], deadline: 15, work: 40, victims: 0, transport: false, onFail: 'injured', injuredOnFail: 4,
      },
      {
        id: 'evacuation', title: 'Évacuation des victimes', brief: 'Victimes triées au poste médical avancé.',
        needs: ['VSAV', 'VSAV', 'SMUR', 'AMB'], deadline: 15, work: 25, victims: 8, transport: true, onFail: 'injured', injuredOnFail: 3,
      },
    ],
  },
];
