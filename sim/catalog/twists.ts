// What the first crew on scene can find: the situation is worse (or different)
// than the caller said. Each twist asks the player a decision (sim/scenes.ts).
import type { UnitType } from './units.ts';

export interface Twist {
  id: string;
  /** Chance it happens when the first vehicle arrives. */
  chance: number;
  /** The crew chief's report. */
  report: string;
  /** What "ask for reinforcements" sends for. */
  add: UnitType[];
}

export const TWISTS: Record<string, Twist[]> = {
  malaise_vp: [
    { id: 'arret', chance: 0.12, report: 'Victime inconsciente, ne respire plus : arrêt cardiaque, massage en cours.', add: ['SMUR'] },
    { id: 'deux', chance: 0.1, report: 'Une deuxième personne a fait un malaise à côté, il faut un second véhicule.', add: ['VSAV'] },
  ],
  malaise_domicile: [
    { id: 'infarctus', chance: 0.18, report: 'Douleur thoracique typique, électrocardiogramme inquiétant : suspicion d\'infarctus.', add: ['SMUR'] },
    { id: 'agite', chance: 0.1, report: 'Le patient est très agité et menace l\'équipe.', add: ['PS'] },
  ],
  chute: [
    { id: 'femur', chance: 0.22, report: 'Fracture du col du fémur, brancardage impossible dans l\'escalier étroit sans renfort.', add: ['VSAV'] },
  ],
  blesse_leger: [
    { id: 'hemorragie', chance: 0.15, report: 'La plaie est profonde, hémorragie difficile à contrôler.', add: ['VSAV'] },
  ],
  feu_poubelle: [
    { id: 'facade', chance: 0.2, report: 'Le feu a gagné la façade et les volets du premier étage.', add: ['FPT'] },
  ],
  feu_vehicule: [
    { id: 'voisines', chance: 0.18, report: 'Les deux voitures garées à côté commencent à brûler.', add: ['FPT'] },
    { id: 'brule', chance: 0.08, report: 'Le conducteur a les mains brûlées.', add: ['VSAV'] },
  ],
  alarme: [
    { id: 'vrai_feu', chance: 0.25, report: 'Ce n\'est pas une fausse alarme : départ de feu en cuisine, fumée dans les couloirs.', add: ['FPT', 'VSAV'] },
  ],
  feu_vegetation: [
    { id: 'vent', chance: 0.25, report: 'Le vent forcit, le feu progresse vers les maisons.', add: ['FPT'] },
  ],
  tapage: [
    { id: 'bagarre', chance: 0.15, report: 'La fête dégénère : bagarre dans la cage d\'escalier.', add: ['PS'] },
  ],
  differend: [
    { id: 'blesse', chance: 0.25, report: 'Une personne est blessée à la tête, elle saigne.', add: ['VSAV'] },
  ],
  cambriolage: [
    { id: 'fuite', chance: 0.3, report: 'Les suspects s\'enfuient en voiture vers le centre.', add: ['PS'] },
  ],
  animal: [
    { id: 'morsure', chance: 0.2, report: 'Le chien a mordu un passant au mollet.', add: ['VSAV'] },
  ],
  avp: [
    { id: 'second', chance: 0.2, report: 'Il y a un second blessé dans l\'autre voiture.', add: ['VSAV'] },
    { id: 'carburant', chance: 0.12, report: 'Fuite de carburant sur la chaussée, risque d\'incendie.', add: ['FPT'] },
  ],
  avp_2roues: [
    { id: 'grave', chance: 0.2, report: 'Le motard a un traumatisme crânien, il perd connaissance.', add: ['SMUR'] },
  ],
  intox_co: [
    { id: 'voisins', chance: 0.3, report: 'Les voisins du dessus sont aussi intoxiqués.', add: ['VSAV'] },
  ],
  accident_travail: [
    { id: 'hauteur', chance: 0.2, report: 'La victime est restée coincée sur la nacelle à huit mètres.', add: ['EPA'] },
  ],
  feu_appart: [
    { id: 'propagation', chance: 0.3, report: 'Le feu passe par les combles vers l\'appartement voisin.', add: ['FPT'] },
    { id: 'victimes', chance: 0.2, report: 'Deux autres habitants sont intoxiqués par les fumées.', add: ['VSAV'] },
  ],
  rixe: [
    { id: 'arme', chance: 0.2, report: 'Un des agresseurs a une arme blanche et s\'est retranché.', add: ['PS'] },
  ],
  braquage: [
    { id: 'otages', chance: 0.25, report: 'Les braqueurs se sont retranchés avec deux employés.', add: ['BAC', 'PS'] },
  ],
  gaz: [
    { id: 'explosion', chance: 0.3, report: 'Concentration explosive dans le sous-sol, il faut évacuer l\'immeuble.', add: ['FPT', 'VSAV'] },
  ],
  inondation: [
    { id: 'electrique', chance: 0.2, report: 'L\'eau atteint le tableau électrique, risque d\'électrocution.', add: ['FPT'] },
  ],
  feu_entrepot: [
    { id: 'produits', chance: 0.3, report: 'Des fûts de produits chimiques sont stockés au fond du hangar.', add: ['VTU'] },
  ],
};
