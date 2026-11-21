// Every kind of call: who must go, how fast, what it pays, when it unlocks.
import { UNITS, type UnitType } from './units.ts';

export type Family = 'sap' | 'feu' | 'police' | 'route' | 'technique';

export const FAMILIES: { id: Family; label: string }[] = [
  { id: 'sap', label: 'Secours à personne' },
  { id: 'feu', label: 'Incendie' },
  { id: 'route', label: 'Accident' },
  { id: 'police', label: 'Police' },
  { id: 'technique', label: 'Opération diverse' },
];
export const FAMILY_LABEL = Object.fromEntries(FAMILIES.map((f) => [f.id, f.label])) as Record<Family, string>;

export interface CallKind {
  id: string;
  family: Family;
  title: string;
  priority: 1 | 2 | 3;
  needs: UnitType[];
  /** Game minutes before the situation degrades. */
  deadline: number;
  /** Game minutes of work once every need is on scene. */
  work: number;
  victims: number;
  /** The victim leaves for hospital in a vehicle that carries. */
  transport: boolean;
  /** A fire left too long spreads: these join the needs. */
  escalate?: UnitType[];
  weight: number;
  callers: string[];
  /** Happens inside a home: the address gets a floor and a door code. */
  home?: boolean;
  /** Derived: the level of its most advanced vehicle. */
  level: number;
  reward: number;
  xp: number;
}

type Spec = Omit<CallKind, 'level' | 'reward' | 'xp'> & { reward?: number; xp?: number };

const spec = (s: Spec): CallKind => {
  const level = Math.max(...s.needs.map((t) => UNITS[t].level));
  const urgency = 4 - s.priority;
  return {
    ...s,
    level,
    reward: s.reward ?? Math.round((250 + urgency * 170 + s.needs.length * 160 + s.victims * 120) / 10) * 10,
    xp: s.xp ?? 5 + urgency * 3 + s.needs.length * 2 + level,
  };
};

export const CALL_KINDS: CallKind[] = [
  // ------------------------------------------------ niveau 1 : VSAV
  spec({
    id: 'malaise_vp', family: 'sap', title: 'Malaise sur la voie publique', priority: 2, needs: ['VSAV'], deadline: 20, work: 12,
    victims: 1, transport: true, weight: 10,
    callers: [
      "Allô ? Y a un monsieur par terre devant la boulangerie, il respire mais il répond pas vraiment.",
      "Une dame vient de tomber à l'arrêt de bus, elle est toute blanche, elle transpire beaucoup.",
      "Bonjour, je suis agent de sécurité au centre commercial. Un client a fait un malaise près des caisses, il est assis, il a du mal à parler.",
      "Mon collègue s'est effondré sur le trottoir en sortant du bureau. Il ouvre les yeux mais il a l'air complètement perdu.",
    ],
  }),
  spec({
    id: 'malaise_domicile', family: 'sap', title: 'Malaise à domicile', priority: 2, needs: ['VSAV'], deadline: 22, work: 14,
    victims: 1, transport: true, weight: 8,
    callers: [
      "Mon père a mal dans la poitrine depuis une demi-heure, ça descend dans le bras, il est tout gris.",
      "Ma coloc est tombée dans la salle de bain, elle s'est réveillée mais elle dit qu'elle voit flou.",
      "C'est l'aide à domicile. Madame Roche ne tient plus debout, elle a vomi deux fois, elle a 82 ans.",
      "Mon mari est diabétique, il est en sueur et il dit n'importe quoi. Je crois qu'il a pas mangé.",
    ],
    home: true,
  }),
  spec({
    id: 'chute', family: 'sap', title: 'Chute de personne âgée', priority: 3, needs: ['VSAV'], deadline: 35, work: 10,
    victims: 1, transport: true, weight: 8,
    callers: [
      "Ma grand-mère est tombée dans sa cuisine, elle a très mal à la hanche, elle peut pas se relever.",
      "Je suis le voisin. J'entends monsieur Petit appeler depuis ce matin, il est par terre, je le vois par la fenêtre.",
      "Résidence Les Tilleuls, infirmière de nuit. Une résidente a chuté, plaie au front, elle est sous anticoagulants.",
    ],
    home: true,
  }),
  spec({
    id: 'blesse_leger', family: 'sap', title: 'Blessé léger', priority: 3, needs: ['VSAV'], deadline: 30, work: 8,
    victims: 1, transport: false, weight: 6,
    callers: [
      "Mon fils est tombé de vélo, il saigne du genou et du menton, il arrête pas de pleurer.",
      "Je me suis coupé la main avec un couteau, j'ai mis un torchon mais ça traverse.",
      "C'est le gardien du gymnase. Un gamin s'est tordu la cheville pendant le match, elle gonfle à vue d'œil.",
    ],
  }),
  // ------------------------------------------------ niveau 2 : FPT
  spec({
    id: 'feu_poubelle', family: 'feu', title: 'Feu de poubelles', priority: 3, needs: ['FPT'], deadline: 25, work: 12,
    victims: 0, transport: false, weight: 6,
    callers: [
      "Il y a des flammes dans le local poubelles en bas de chez moi, ça fume noir dans la cour.",
      "Les containers brûlent sur le trottoir et le feu commence à lécher une voiture garée.",
      "Je passe en voiture, rue du marché, une benne à ordures est en feu, il y a personne autour.",
    ],
  }),
  spec({
    id: 'feu_vehicule', family: 'feu', title: 'Feu de véhicule', priority: 2, needs: ['FPT'], deadline: 18, work: 15,
    victims: 0, transport: false, escalate: ['FPT'], weight: 5,
    callers: [
      "Une voiture brûle au milieu de la rue, grosse fumée noire, les gens sortent des immeubles pour regarder.",
      "Mon moteur a pris feu, je suis sorti avec les enfants, ça part de plus en plus fort.",
      "Scooter en feu contre une façade, juste sous des fenêtres, faites vite.",
    ],
  }),
  spec({
    id: 'alarme', family: 'feu', title: 'Alarme incendie', priority: 3, needs: ['FPT'], deadline: 25, work: 8,
    victims: 0, transport: false, weight: 4,
    callers: [
      "L'alarme incendie de l'école sonne et personne sait pourquoi, on a fait sortir les enfants.",
      "Le détecteur de fumée du voisin sonne depuis vingt minutes et il répond pas quand on frappe.",
      "Hôtel de la Gare, réception. L'alarme s'est déclenchée au deuxième étage, je vois pas de fumée.",
    ],
  }),
  spec({
    id: 'feu_vegetation', family: 'feu', title: 'Feu de végétation', priority: 2, needs: ['FPT'], deadline: 16, work: 20,
    victims: 0, transport: false, escalate: ['FPT'], weight: 3,
    callers: [
      "Le talus le long de la voie brûle et avec le vent ça part vers les jardins.",
      "Des broussailles ont pris feu dans le parc, des jeunes ont essayé d'éteindre avec leurs bouteilles.",
      "Ça brûle sur le terrain vague à côté de chez moi, les flammes font deux mètres.",
    ],
  }),
  // ------------------------------------------------ niveau 3 : Police-secours
  spec({
    id: 'tapage', family: 'police', title: 'Tapage nocturne', priority: 3, needs: ['PS'], deadline: 30, work: 10,
    victims: 0, transport: false, weight: 5,
    callers: [
      "Il est deux heures du matin et le troisième fait une fête, les murs tremblent, ça fait trois soirs.",
      "Des jeunes crient et klaxonnent sur le parking depuis une heure, j'ai un bébé qui dort pas.",
      "Le bar d'en face a sorti des enceintes sur le trottoir, c'est impossible de dormir.",
    ],
    home: true,
  }),
  spec({
    id: 'differend', family: 'police', title: 'Différend familial', priority: 2, needs: ['PS'], deadline: 18, work: 20,
    victims: 0, transport: false, weight: 5,
    callers: [
      "Ça hurle chez les voisins depuis une heure, j'ai entendu des objets se casser.",
      "Mon ex refuse de partir de chez moi, il me menace, j'ai peur. Je suis enfermée dans la chambre.",
      "J'entends une femme pleurer et un homme crier dans l'escalier, ça a l'air violent.",
    ],
    home: true,
  }),
  spec({
    id: 'cambriolage', family: 'police', title: 'Cambriolage en cours', priority: 2, needs: ['PS'], deadline: 12, work: 15,
    victims: 0, transport: false, weight: 5,
    callers: [
      "J'entends quelqu'un forcer la porte de l'appartement d'en face, ils sont deux, je parle doucement.",
      "Il y a des lampes torches qui bougent chez les voisins, ils sont en vacances jusqu'à dimanche.",
      "Je rentre du travail et ma porte est fracturée, j'entends encore du bruit à l'intérieur.",
    ],
    home: true,
  }),
  spec({
    id: 'animal', family: 'police', title: 'Animal errant dangereux', priority: 3, needs: ['PS'], deadline: 30, work: 12,
    victims: 0, transport: false, weight: 3,
    callers: [
      "Un gros chien sans collier grogne sur les enfants devant l'école, les parents osent pas sortir.",
      "Il y a un sanglier au milieu du lotissement, il a défoncé une haie.",
      "Un chien a mordu le facteur, le propriétaire est introuvable.",
    ],
  }),
  // ------------------------------------------------ niveau 4 : VSR
  spec({
    id: 'avp', family: 'route', title: 'Accident de la route', priority: 2, needs: ['VSR', 'VSAV'], deadline: 16, work: 18,
    victims: 1, transport: true, weight: 6,
    callers: [
      "Une voiture a tapé un poteau, le conducteur saigne du front, il est encore dans la voiture.",
      "Accrochage au carrefour, une passagère se plaint du cou, elle bouge pas.",
      "Je suis témoin, une voiture a fait un tonneau sur le boulevard, elle est sur le toit.",
    ],
  }),
  spec({
    id: 'avp_2roues', family: 'route', title: 'Accident de deux-roues', priority: 2, needs: ['VSAV', 'PS'], deadline: 15, work: 15,
    victims: 1, transport: true, weight: 5,
    callers: [
      "Un scooter a glissé dans le rond-point, le gars est par terre, il se relève pas.",
      "Un cycliste s'est fait renverser par une camionnette qui s'est barrée, il a la jambe bizarre.",
      "Moto contre voiture à l'angle, le motard a encore son casque, il respire, il parle pas.",
    ],
  }),
  // ------------------------------------------------ niveau 5 : ambulance
  spec({
    id: 'transport', family: 'sap', title: 'Transport sanitaire urgent', priority: 3, needs: ['AMB'], deadline: 40, work: 8,
    victims: 1, transport: true, weight: 5,
    callers: [
      "Docteur Morel, médecin de garde. Il me faut un transport urgent pour une patiente fébrile à 40.",
      "EHPAD Bel Âge, infirmière. Un résident a de la fièvre et sature à 89, le médecin demande l'hôpital.",
      "Ma mère sort de dialyse et elle est très faible, on n'a pas de voiture, son médecin dit d'appeler.",
    ],
    home: true,
  }),
  spec({
    id: 'intox_co', family: 'sap', title: 'Intoxication au monoxyde de carbone', priority: 2, needs: ['FPT', 'AMB'], deadline: 15, work: 18,
    victims: 2, transport: true, weight: 3,
    callers: [
      "Toute la famille a mal à la tête et envie de vomir, la chaudière fait un bruit bizarre depuis hier.",
      "Mon détecteur de monoxyde sonne et mon fils vient de vomir, on est sortis sur le palier.",
      "Le chauffage d'appoint tourne depuis ce matin, ma grand-mère est somnolente, elle répond mal.",
    ],
    home: true,
  }),
  spec({
    id: 'accident_travail', family: 'sap', title: 'Accident de travail', priority: 2, needs: ['VSAV', 'AMB'], deadline: 18, work: 16,
    victims: 1, transport: true, weight: 4,
    callers: [
      "Un ouvrier est tombé de l'échafaudage, il dit qu'il sent plus ses jambes.",
      "Chef d'atelier, un collègue s'est pris la main dans la presse, on a coupé la machine.",
      "Un livreur s'est fait coincer entre son camion et le quai, il a très mal au bassin.",
    ],
  }),
  // ------------------------------------------------ niveau 6 : SMUR
  spec({
    id: 'arret', family: 'sap', title: 'Arrêt cardio-respiratoire', priority: 1, needs: ['VSAV', 'SMUR'], deadline: 10, work: 25,
    victims: 1, transport: true, weight: 4,
    callers: [
      "Mon mari respire plus ! Il est tombé d'un coup dans le salon, je fais quoi ?",
      "Un joggeur est par terre au bord du parc, il bouge plus, un monsieur fait un massage.",
      "Pharmacie du centre. Un client s'est effondré au comptoir, il respire plus, on commence le massage.",
    ],
  }),
  spec({
    id: 'detresse', family: 'sap', title: 'Détresse respiratoire', priority: 1, needs: ['VSAV', 'SMUR'], deadline: 12, work: 18,
    victims: 1, transport: true, weight: 3,
    callers: [
      "Mon fils fait une crise d'asthme très forte, la Ventoline marche pas, il arrive plus à parler.",
      "Elle respire plus bien, ses lèvres deviennent bleues, elle est assise penchée en avant.",
      "Mon père a une maladie des poumons, il est sous oxygène, il étouffe depuis dix minutes.",
    ],
    home: true,
  }),
  spec({
    id: 'avc', family: 'sap', title: 'Suspicion d\'AVC', priority: 1, needs: ['SMUR', 'AMB'], deadline: 12, work: 15,
    victims: 1, transport: true, weight: 3,
    callers: [
      "Ma mère parle bizarrement et sa bouche est de travers depuis dix minutes.",
      "Mon collègue peut plus lever le bras droit et il bafouille, ça a commencé pendant la réunion.",
      "Mon mari s'est réveillé de la sieste, il comprend plus ce que je dis, la moitié du visage tombe.",
    ],
    home: true,
  }),
  // ------------------------------------------------ niveau 7 : EPA
  spec({
    id: 'feu_appart', family: 'feu', title: 'Feu d\'appartement', priority: 1, needs: ['FPT', 'EPA', 'VSAV'], deadline: 14, work: 30,
    victims: 1, transport: true, escalate: ['FPT'], weight: 4,
    callers: [
      "De la fumée sort des fenêtres du quatrième, quelqu'un crie au balcon !",
      "Ça sent le brûlé dans l'immeuble et je vois des flammes chez la voisine du dessus.",
      "La cage d'escalier est pleine de fumée, on peut plus descendre, on est quatre dans l'appartement.",
    ],
    home: true,
  }),
  spec({
    id: 'hauteur', family: 'technique', title: 'Personne bloquée en hauteur', priority: 2, needs: ['EPA', 'VSAV'], deadline: 20, work: 18,
    victims: 1, transport: false, weight: 2,
    callers: [
      "Un laveur de vitres est coincé sur sa nacelle en panne au sixième.",
      "Un enfant est monté sur le toit du gymnase et il arrive plus à redescendre.",
      "Un homme est assis sur le rebord de la fenêtre au cinquième, il dit qu'il va sauter.",
    ],
  }),
  // ------------------------------------------------ niveau 8 : BAC
  spec({
    id: 'vol', family: 'police', title: 'Vol à l\'arraché', priority: 3, needs: ['BAC'], deadline: 15, work: 10,
    victims: 0, transport: false, weight: 4,
    callers: [
      "On vient de m'arracher mon sac, le gars est parti en scooter vers le centre, scooter noir.",
      "Un jeune a piqué le téléphone d'une dame et il court vers la gare, sweat rouge.",
      "Pickpockets dans le bus 12, ils viennent de descendre à l'arrêt de la mairie.",
    ],
  }),
  spec({
    id: 'rixe', family: 'police', title: 'Rixe sur la voie publique', priority: 1, needs: ['PS', 'BAC', 'VSAV'], deadline: 10, work: 18,
    victims: 1, transport: true, weight: 3,
    callers: [
      "Une bagarre devant le bar, il y en a un qui saigne beaucoup de la tête.",
      "Ils sont une dizaine à se battre, il y a des bouteilles cassées partout.",
      "Sortie de match, deux groupes se tapent dessus sur le parking, un gars est au sol.",
    ],
  }),
  spec({
    id: 'braquage', family: 'police', title: 'Braquage en cours', priority: 1, needs: ['BAC', 'PS'], deadline: 9, work: 25,
    victims: 0, transport: false, weight: 2,
    callers: [
      "Deux hommes armés sont dans la bijouterie, je les vois depuis le café d'en face.",
      "On braque la station-service, le gérant est à terre derrière le comptoir.",
      "Banque de la place, j'ai déclenché l'alarme silencieuse, ils sont trois, cagoulés.",
    ],
  }),
  // ------------------------------------------------ niveau 9 : VTU
  spec({
    id: 'inondation', family: 'technique', title: 'Inondation de cave', priority: 3, needs: ['VTU'], deadline: 40, work: 20,
    victims: 0, transport: false, weight: 4,
    callers: [
      "L'eau monte dans la cave de l'immeuble, il y a déjà trente centimètres.",
      "Une canalisation a cédé, la cour est inondée et ça rentre dans les garages.",
      "Le plafond de ma cuisine goutte de partout, le voisin du dessus répond pas.",
    ],
    home: true,
  }),
  spec({
    id: 'gaz', family: 'technique', title: 'Fuite de gaz', priority: 1, needs: ['FPT', 'VTU', 'PS'], deadline: 12, work: 22,
    victims: 0, transport: false, weight: 2,
    callers: [
      "Ça sent très fort le gaz dans toute la rue, des ouvriers ont percé un tuyau.",
      "Odeur de gaz énorme dans la cage d'escalier, j'ai peur que ça pète.",
      "La gazinière est restée ouverte chez la voisine, elle est partie, ça sent jusque chez moi.",
    ],
    home: true,
  }),
  spec({
    id: 'frelons', family: 'technique', title: 'Nid de frelons', priority: 3, needs: ['VTU'], deadline: 50, work: 12,
    victims: 0, transport: false, weight: 3,
    callers: [
      "Il y a un énorme nid de frelons asiatiques au-dessus de l'entrée de la crèche.",
      "Des frelons sortent de mon volet roulant par dizaines, j'ai un enfant allergique.",
      "Nid de frelons dans l'arbre de la cour de récré, la directrice a fait rentrer les élèves.",
    ],
  }),
  spec({
    id: 'ascenseur', family: 'technique', title: 'Personnes bloquées dans un ascenseur', priority: 3, needs: ['VTU'], deadline: 35, work: 10,
    victims: 0, transport: false, weight: 3,
    callers: [
      "Je suis bloquée dans l'ascenseur entre deux étages avec ma fille de trois ans.",
      "L'ascenseur de la résidence est coincé, une personne âgée est dedans depuis vingt minutes.",
      "On est cinq dans l'ascenseur du parking, il fait très chaud, une dame panique.",
    ],
    home: true,
  }),
  // ------------------------------------------------ niveau 10 : FPTGP
  spec({
    id: 'feu_entrepot', family: 'feu', title: 'Feu d\'entrepôt', priority: 1, needs: ['FPTGP', 'FPT', 'EPA'], deadline: 14, work: 40,
    victims: 0, transport: false, escalate: ['FPT', 'FPT'], weight: 2,
    callers: [
      "L'entrepôt de la zone artisanale est en flammes, il y a une colonne de fumée énorme.",
      "Le toit du hangar logistique s'effondre, ça brûle de partout, des palettes explosent.",
      "Je suis vigile, le feu a pris dans le stockage de pneus, on voit la fumée depuis l'autoroute.",
    ],
  }),
  spec({
    id: 'feu_industriel', family: 'feu', title: 'Feu industriel', priority: 1, needs: ['FPTGP', 'FPT', 'VTU', 'SMUR'], deadline: 12, work: 45,
    victims: 1, transport: true, escalate: ['FPTGP'], weight: 1,
    callers: [
      "Explosion dans l'usine chimique, un employé est brûlé, il y a des fumées jaunes.",
      "Une cuve a pris feu dans la station d'épuration, deux techniciens sont blessés.",
      "Responsable sécurité de l'usine. Fuite enflammée sur une ligne de solvant, on évacue le site.",
    ],
  }),
  // ------------------------------------------------ niveau 11 : hélicoptère
  spec({
    id: 'noyade', family: 'sap', title: 'Noyade', priority: 1, needs: ['HELI', 'VSAV'], deadline: 9, work: 20,
    victims: 1, transport: true, weight: 2,
    callers: [
      "Un enfant a coulé dans la rivière, des gens plongent pour le chercher !",
      "Un baigneur est inconscient au bord du plan d'eau, il est tout bleu.",
      "Maître-nageur de la base de loisirs, on vient de sortir un adolescent de l'eau, il respire pas.",
    ],
  }),
  spec({
    id: 'avp_isole', family: 'route', title: 'Accident grave, victime incarcérée', priority: 1, needs: ['HELI', 'VSR', 'VSAV'], deadline: 11, work: 35,
    victims: 2, transport: true, weight: 2,
    callers: [
      "Deux voitures en face à face, quelqu'un est coincé dans l'habitacle et répond plus.",
      "Un camion a écrasé une voiture au carrefour, il y a des gens bloqués dedans.",
      "Une voiture est dans le fossé sur la départementale, le conducteur est coincé par le volant.",
    ],
  }),
  // ------------------------------------------------ niveau 12 : VPMA
  spec({
    id: 'accident_car', family: 'route', title: 'Accident de car, nombreuses victimes', priority: 1, needs: ['VPMA', 'VSR', 'VSAV', 'VSAV', 'SMUR', 'PS'], deadline: 15, work: 50,
    victims: 6, transport: true, weight: 1,
    callers: [
      "Un car scolaire s'est renversé dans le virage, il y a des enfants partout sur la route.",
      "Un bus de touristes a percuté un pont, beaucoup de blessés, certains bougent plus.",
      "Chauffeur de bus, on a été percutés par un poids lourd, j'ai quarante passagers.",
    ],
  }),
  spec({
    id: 'plan_rouge', family: 'route', title: 'Plan rouge : effondrement', priority: 1, needs: ['VPMA', 'FPT', 'VSAV', 'VSAV', 'SMUR', 'AMB', 'PS'], deadline: 15, work: 60,
    victims: 8, transport: true, weight: 1,
    callers: [
      "Une tribune du stade s'est effondrée pendant le match, il y a des dizaines de blessés.",
      "Le plancher de la salle des fêtes a cédé pendant le mariage, beaucoup de gens sont coincés.",
      "Le chapiteau du cirque s'est écroulé avec le vent, il y avait du monde dessous.",
    ],
  }),
];

export const kindsForLevel = (level: number) => CALL_KINDS.filter((k) => k.level <= level);
export const kindsUnlockedAt = (level: number) => CALL_KINDS.filter((k) => k.level === level);
