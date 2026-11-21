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
    callers: ['Un homme s\'est effondré devant la boulangerie, il respire mais ne répond pas bien.', 'Une dame a fait un malaise à l\'arrêt de bus, elle est très pâle.'],
  }),
  spec({
    id: 'malaise_domicile', family: 'sap', title: 'Malaise à domicile', priority: 2, needs: ['VSAV'], deadline: 22, work: 14,
    victims: 1, transport: true, weight: 8,
    callers: ['Mon père a des sueurs et une douleur dans le bras gauche depuis tout à l\'heure.', 'Ma colocataire est tombée dans les pommes dans la salle de bain.'],
  }),
  spec({
    id: 'chute', family: 'sap', title: 'Chute de personne âgée', priority: 3, needs: ['VSAV'], deadline: 35, work: 10,
    victims: 1, transport: true, weight: 8,
    callers: ['Ma grand-mère est tombée dans sa cuisine, elle a très mal à la hanche.', 'Mon voisin de 85 ans est par terre depuis ce matin, il n\'arrive pas à se relever.'],
  }),
  spec({
    id: 'blesse_leger', family: 'sap', title: 'Blessé léger', priority: 3, needs: ['VSAV'], deadline: 30, work: 8,
    victims: 1, transport: false, weight: 6,
    callers: ['Un enfant est tombé de vélo, il saigne du genou et il pleure beaucoup.', 'Je me suis coupé la main avec un couteau, ça ne s\'arrête pas de saigner.'],
  }),
  // ------------------------------------------------ niveau 2 : FPT
  spec({
    id: 'feu_poubelle', family: 'feu', title: 'Feu de poubelles', priority: 3, needs: ['FPT'], deadline: 25, work: 12,
    victims: 0, transport: false, weight: 6,
    callers: ['Il y a des flammes dans le local à poubelles en bas de chez moi, ça fume beaucoup.', 'Les containers brûlent sur le trottoir, ça commence à toucher une voiture garée.'],
  }),
  spec({
    id: 'feu_vehicule', family: 'feu', title: 'Feu de véhicule', priority: 2, needs: ['FPT'], deadline: 18, work: 15,
    victims: 0, transport: false, escalate: ['FPT'], weight: 5,
    callers: ['Une voiture est en feu au milieu de la rue, il y a de la fumée noire !', 'Le moteur de ma voiture a pris feu, je suis sorti mais ça brûle fort.'],
  }),
  spec({
    id: 'alarme', family: 'feu', title: 'Alarme incendie', priority: 3, needs: ['FPT'], deadline: 25, work: 8,
    victims: 0, transport: false, weight: 4,
    callers: ['L\'alarme incendie de l\'école sonne et personne ne sait pourquoi.', 'Le détecteur de fumée du voisin sonne depuis vingt minutes, il ne répond pas.'],
  }),
  spec({
    id: 'feu_vegetation', family: 'feu', title: 'Feu de végétation', priority: 2, needs: ['FPT'], deadline: 16, work: 20,
    victims: 0, transport: false, escalate: ['FPT'], weight: 3,
    callers: ['Le talus le long de la voie brûle, le vent pousse les flammes vers les jardins.', 'Des broussailles ont pris feu dans le parc, ça s\'étend vite.'],
  }),
  // ------------------------------------------------ niveau 3 : Police-secours
  spec({
    id: 'tapage', family: 'police', title: 'Tapage nocturne', priority: 3, needs: ['PS'], deadline: 30, work: 10,
    victims: 0, transport: false, weight: 5,
    callers: ['Il y a une fête énorme au troisième, la musique fait trembler les murs.', 'Des jeunes crient et klaxonnent sur le parking depuis une heure.'],
  }),
  spec({
    id: 'differend', family: 'police', title: 'Différend familial', priority: 2, needs: ['PS'], deadline: 18, work: 20,
    victims: 0, transport: false, weight: 5,
    callers: ['Ça hurle chez les voisins depuis une heure, j\'ai entendu des objets se casser.', 'Mon ex refuse de partir et me menace, j\'ai peur.'],
  }),
  spec({
    id: 'cambriolage', family: 'police', title: 'Cambriolage en cours', priority: 2, needs: ['PS'], deadline: 12, work: 15,
    victims: 0, transport: false, weight: 5,
    callers: ['J\'entends quelqu\'un forcer la porte de l\'appartement d\'en face, ils sont deux.', 'Il y a des gens avec des lampes dans la maison des voisins qui sont en vacances.'],
  }),
  spec({
    id: 'animal', family: 'police', title: 'Animal errant dangereux', priority: 3, needs: ['PS'], deadline: 30, work: 12,
    victims: 0, transport: false, weight: 3,
    callers: ['Un gros chien sans collier grogne sur les enfants devant l\'école.', 'Un sanglier se promène au milieu du lotissement !'],
  }),
  // ------------------------------------------------ niveau 4 : VSR
  spec({
    id: 'avp', family: 'route', title: 'Accident de la route', priority: 2, needs: ['VSR', 'VSAV'], deadline: 16, work: 18,
    victims: 1, transport: true, weight: 6,
    callers: ['Une voiture a percuté un poteau, le conducteur saigne du front.', 'Deux voitures se sont accrochées au carrefour, une passagère a mal au cou.'],
  }),
  spec({
    id: 'avp_2roues', family: 'route', title: 'Accident de deux-roues', priority: 2, needs: ['VSAV', 'PS'], deadline: 15, work: 15,
    victims: 1, transport: true, weight: 5,
    callers: ['Un scooter a glissé dans le rond-point, le conducteur est au sol et ne se relève pas.', 'Un cycliste s\'est fait renverser par une camionnette qui est partie !'],
  }),
  // ------------------------------------------------ niveau 5 : ambulance
  spec({
    id: 'transport', family: 'sap', title: 'Transport sanitaire urgent', priority: 3, needs: ['AMB'], deadline: 40, work: 8,
    victims: 1, transport: true, weight: 5,
    callers: ['Le médecin de garde demande un transport à l\'hôpital pour une patiente fébrile.', 'L\'EHPAD a besoin d\'une ambulance pour un résident qui a de la fièvre.'],
  }),
  spec({
    id: 'intox_co', family: 'sap', title: 'Intoxication au monoxyde de carbone', priority: 2, needs: ['FPT', 'AMB'], deadline: 15, work: 18,
    victims: 2, transport: true, weight: 3,
    callers: ['Toute la famille a mal à la tête et des nausées, la chaudière fait un drôle de bruit.', 'Mon détecteur de CO sonne et mon fils vient de vomir.'],
  }),
  spec({
    id: 'accident_travail', family: 'sap', title: 'Accident de travail', priority: 2, needs: ['VSAV', 'AMB'], deadline: 18, work: 16,
    victims: 1, transport: true, weight: 4,
    callers: ['Un ouvrier est tombé d\'un échafaudage sur le chantier, il ne sent plus ses jambes.', 'Un collègue s\'est pris la main dans une machine à l\'atelier.'],
  }),
  // ------------------------------------------------ niveau 6 : SMUR
  spec({
    id: 'arret', family: 'sap', title: 'Arrêt cardio-respiratoire', priority: 1, needs: ['VSAV', 'SMUR'], deadline: 10, work: 25,
    victims: 1, transport: true, weight: 4,
    callers: ['Mon mari ne respire plus ! Il est tombé d\'un coup, je fais quoi ?!', 'Un joggeur est par terre, il ne bouge plus, quelqu\'un fait un massage.'],
  }),
  spec({
    id: 'detresse', family: 'sap', title: 'Détresse respiratoire', priority: 1, needs: ['VSAV', 'SMUR'], deadline: 12, work: 18,
    victims: 1, transport: true, weight: 3,
    callers: ['Mon fils fait une crise d\'asthme très forte, son inhalateur ne marche pas.', 'Elle n\'arrive plus à respirer, ses lèvres deviennent bleues !'],
  }),
  spec({
    id: 'avc', family: 'sap', title: 'Suspicion d\'AVC', priority: 1, needs: ['SMUR', 'AMB'], deadline: 12, work: 15,
    victims: 1, transport: true, weight: 3,
    callers: ['Ma mère parle bizarrement et sa bouche est de travers depuis dix minutes.', 'Mon collègue ne peut plus lever le bras droit et il bafouille.'],
  }),
  // ------------------------------------------------ niveau 7 : EPA
  spec({
    id: 'feu_appart', family: 'feu', title: 'Feu d\'appartement', priority: 1, needs: ['FPT', 'EPA', 'VSAV'], deadline: 14, work: 30,
    victims: 1, transport: true, escalate: ['FPT'], weight: 4,
    callers: ['De la fumée sort des fenêtres du 4e étage, quelqu\'un crie au balcon !', 'Ça sent le brûlé dans l\'immeuble et je vois des flammes chez la voisine du dessus.'],
  }),
  spec({
    id: 'hauteur', family: 'technique', title: 'Personne bloquée en hauteur', priority: 2, needs: ['EPA', 'VSAV'], deadline: 20, work: 18,
    victims: 1, transport: false, weight: 2,
    callers: ['Un laveur de vitres est coincé sur sa nacelle en panne au 6e étage.', 'Un enfant est monté sur le toit du gymnase et n\'arrive plus à descendre.'],
  }),
  // ------------------------------------------------ niveau 8 : BAC
  spec({
    id: 'vol', family: 'police', title: 'Vol à l\'arraché', priority: 3, needs: ['BAC'], deadline: 15, work: 10,
    victims: 0, transport: false, weight: 4,
    callers: ['On vient de m\'arracher mon sac, le type est parti en scooter vers le centre !', 'Un jeune a volé le téléphone d\'une dame et s\'enfuit en courant.'],
  }),
  spec({
    id: 'rixe', family: 'police', title: 'Rixe sur la voie publique', priority: 1, needs: ['PS', 'BAC', 'VSAV'], deadline: 10, work: 18,
    victims: 1, transport: true, weight: 3,
    callers: ['Une bagarre éclate devant le bar, il y en a un qui saigne beaucoup !', 'Ils sont une dizaine à se battre, il y a des bouteilles cassées.'],
  }),
  spec({
    id: 'braquage', family: 'police', title: 'Braquage en cours', priority: 1, needs: ['BAC', 'PS'], deadline: 9, work: 25,
    victims: 0, transport: false, weight: 2,
    callers: ['Deux hommes armés sont dans la bijouterie, je les vois depuis le café d\'en face !', 'On braque la station-service, le gérant est à terre derrière le comptoir.'],
  }),
  // ------------------------------------------------ niveau 9 : VTU
  spec({
    id: 'inondation', family: 'technique', title: 'Inondation de cave', priority: 3, needs: ['VTU'], deadline: 40, work: 20,
    victims: 0, transport: false, weight: 4,
    callers: ['L\'eau monte dans la cave de l\'immeuble, il y a déjà trente centimètres.', 'Une canalisation a cédé, la cour est inondée et ça rentre dans les garages.'],
  }),
  spec({
    id: 'gaz', family: 'technique', title: 'Fuite de gaz', priority: 1, needs: ['FPT', 'VTU', 'PS'], deadline: 12, work: 22,
    victims: 0, transport: false, weight: 2,
    callers: ['Ça sent très fort le gaz dans toute la rue, des ouvriers ont percé un tuyau.', 'Odeur de gaz énorme dans la cage d\'escalier, j\'ai peur que ça explose.'],
  }),
  spec({
    id: 'frelons', family: 'technique', title: 'Nid de frelons', priority: 3, needs: ['VTU'], deadline: 50, work: 12,
    victims: 0, transport: false, weight: 3,
    callers: ['Il y a un énorme nid de frelons asiatiques au-dessus de l\'entrée de la crèche.', 'Des frelons sortent de mon volet roulant par dizaines.'],
  }),
  spec({
    id: 'ascenseur', family: 'technique', title: 'Personnes bloquées dans un ascenseur', priority: 3, needs: ['VTU'], deadline: 35, work: 10,
    victims: 0, transport: false, weight: 3,
    callers: ['Je suis bloquée dans l\'ascenseur entre deux étages avec ma fille de trois ans.', 'L\'ascenseur de la résidence est coincé, une personne âgée est dedans.'],
  }),
  // ------------------------------------------------ niveau 10 : FPTGP
  spec({
    id: 'feu_entrepot', family: 'feu', title: 'Feu d\'entrepôt', priority: 1, needs: ['FPTGP', 'FPT', 'EPA'], deadline: 14, work: 40,
    victims: 0, transport: false, escalate: ['FPT', 'FPT'], weight: 2,
    callers: ['L\'entrepôt de la zone artisanale est en flammes, il y a une colonne de fumée énorme.', 'Le toit du hangar logistique s\'effondre, ça brûle de partout.'],
  }),
  spec({
    id: 'feu_industriel', family: 'feu', title: 'Feu industriel', priority: 1, needs: ['FPTGP', 'FPT', 'VTU', 'SMUR'], deadline: 12, work: 45,
    victims: 1, transport: true, escalate: ['FPTGP'], weight: 1,
    callers: ['Explosion dans l\'usine chimique ! Un employé est brûlé et il y a des fumées jaunes.', 'Une cuve a pris feu dans la station d\'épuration, deux techniciens sont blessés.'],
  }),
  // ------------------------------------------------ niveau 11 : hélicoptère
  spec({
    id: 'noyade', family: 'sap', title: 'Noyade', priority: 1, needs: ['HELI', 'VSAV'], deadline: 9, work: 20,
    victims: 1, transport: true, weight: 2,
    callers: ['Un enfant a coulé dans la rivière, des gens plongent pour le chercher !', 'Un baigneur est inconscient au bord du plan d\'eau, il est tout bleu.'],
  }),
  spec({
    id: 'avp_isole', family: 'route', title: 'Accident grave, victime incarcérée', priority: 1, needs: ['HELI', 'VSR', 'VSAV'], deadline: 11, work: 35,
    victims: 2, transport: true, weight: 2,
    callers: ['Deux voitures en face à face, quelqu\'un est coincé dans l\'habitacle et ne répond plus !', 'Un camion a écrasé une voiture au carrefour, il y a des gens bloqués dedans.'],
  }),
  // ------------------------------------------------ niveau 12 : VPMA
  spec({
    id: 'accident_car', family: 'route', title: 'Accident de car, nombreuses victimes', priority: 1, needs: ['VPMA', 'VSR', 'VSAV', 'VSAV', 'SMUR', 'PS'], deadline: 15, work: 50,
    victims: 6, transport: true, weight: 1,
    callers: ['Un car scolaire s\'est renversé dans le virage, il y a des enfants partout sur la route !', 'Un bus de touristes a percuté un pont, beaucoup de blessés, certains ne bougent plus.'],
  }),
  spec({
    id: 'plan_rouge', family: 'route', title: 'Plan rouge : effondrement', priority: 1, needs: ['VPMA', 'FPT', 'VSAV', 'VSAV', 'SMUR', 'AMB', 'PS'], deadline: 15, work: 60,
    victims: 8, transport: true, weight: 1,
    callers: ['Une tribune du stade s\'est effondrée pendant le match, il y a des dizaines de blessés !', 'Le plancher de la salle des fêtes a cédé pendant le mariage, beaucoup de gens sont coincés.'],
  }),
];

export const kindsForLevel = (level: number) => CALL_KINDS.filter((k) => k.level <= level);
export const kindsUnlockedAt = (level: number) => CALL_KINDS.filter((k) => k.level === level);
