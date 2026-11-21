// Achievements: long-term goals, each paid once. `goal` gives progress as
// [value, target]; the achievement is won once value reaches target.
import { coverageShare } from '../coverage.ts';
import { shiftDay } from '../contracts.ts';
import type { World } from '../types.ts';
import { MAJORS } from './majors.ts';
import { UPGRADES } from './upgrades.ts';
import { UNIT_ORDER } from './units.ts';

export interface Achievement {
  id: string;
  title: string;
  detail: string;
  goal: (w: World) => [number, number];
  money: number;
  xp: number;
}

const won = (w: World, id: string) => w.records.crisesWon.includes(id);
const count = (w: World, kind: string) => w.buildings.filter((b) => b.kind === kind).length;

export const ACHIEVEMENTS: Achievement[] = [
  // ------------------------------------------------ premiers pas
  { id: 'premier_depart', title: 'Premier départ', detail: 'Engager un véhicule.', goal: (w) => [w.units.reduce((s, u) => s + u.missions, 0), 1], money: 500, xp: 20 },
  { id: 'premiere_vie', title: 'Première vie sauvée', detail: 'Sauver une victime.', goal: (w) => [w.stats.saved, 1], money: 1000, xp: 30 },
  { id: 'reseau', title: 'Les trois services', detail: 'Avoir une caserne, un poste de police et un hôpital.', goal: (w) => [['caserne', 'police', 'hopital'].filter((k) => count(w, k) > 0).length, 3], money: 6000, xp: 200 },
  // ------------------------------------------------ volume
  { id: 'appels_100', title: 'Cent appels', detail: 'Traiter 100 appels.', goal: (w) => [w.stats.calls, 100], money: 5000, xp: 150 },
  { id: 'appels_500', title: 'Cinq cents appels', detail: 'Traiter 500 appels.', goal: (w) => [w.stats.calls, 500], money: 20000, xp: 500 },
  { id: 'appels_1000', title: 'Mille appels', detail: 'Traiter 1 000 appels.', goal: (w) => [w.stats.calls, 1000], money: 50000, xp: 1000 },
  { id: 'vies_100', title: 'Cent vies', detail: 'Sauver 100 victimes.', goal: (w) => [w.stats.saved, 100], money: 15000, xp: 400 },
  { id: 'vies_500', title: 'Cinq cents vies', detail: 'Sauver 500 victimes.', goal: (w) => [w.stats.saved, 500], money: 60000, xp: 1500 },
  // ------------------------------------------------ qualité
  { id: 'sans_perte', title: 'Journée sans perte', detail: 'Finir une journée d\'au moins 10 interventions sans victime perdue.', goal: (w) => [w.records.cleanDays, 1], money: 8000, xp: 250 },
  { id: 'sans_perte_7', title: 'Sept journées sans perte', detail: 'Sept journées sans victime perdue.', goal: (w) => [w.records.cleanDays, 7], money: 40000, xp: 1200 },
  { id: 'qualif_10', title: 'Oreille sûre', detail: 'Qualifier 10 appels de suite sans erreur.', goal: (w) => [w.records.bestQualifyRun, 10], money: 3000, xp: 100 },
  { id: 'qualif_50', title: 'Opérateur chevronné', detail: 'Qualifier 50 appels de suite sans erreur.', goal: (w) => [w.records.bestQualifyRun, 50], money: 15000, xp: 400 },
  { id: 'rapide', title: 'Toujours là à temps', detail: 'Une journée d\'au moins 10 interventions avec un délai moyen sous 6 minutes.', goal: (w) => [w.records.fastDays, 1], money: 6000, xp: 200 },
  { id: 'serie_7', title: 'Semaine parfaite', detail: 'Remplir tous les contrats sept jours de suite.', goal: (w) => [w.streak, 7], money: 30000, xp: 900 },
  { id: 'neige', title: 'Tenir sous la neige', detail: 'Une journée de neige d\'au moins 10 interventions sans échec.', goal: (w) => [w.records.snowClean, 1], money: 15000, xp: 500 },
  // ------------------------------------------------ réseau et flotte
  { id: 'couverture_80', title: 'Ville couverte', detail: 'Couvrir 80 % des rues en moins de 3 minutes.', goal: (w) => [Math.round(coverageShare(w) * 100), 80], money: 10000, xp: 300 },
  { id: 'casernes_3', title: 'Trois casernes', detail: 'Avoir trois casernes.', goal: (w) => [count(w, 'caserne'), 3], money: 8000, xp: 250 },
  { id: 'flotte_10', title: 'Dix véhicules', detail: 'Avoir dix véhicules en service.', goal: (w) => [w.units.length, 10], money: 6000, xp: 200 },
  { id: 'flotte_25', title: 'Vingt-cinq véhicules', detail: 'Avoir vingt-cinq véhicules en service.', goal: (w) => [w.units.length, 25], money: 25000, xp: 700 },
  { id: 'toutes_unites', title: 'Tous les moyens', detail: 'Avoir au moins un véhicule de chaque type.', goal: (w) => [new Set(w.units.map((u) => u.type)).size, UNIT_ORDER.length], money: 100000, xp: 3000 },
  {
    id: 'caserne_equipee', title: 'Caserne modèle', detail: 'Installer toutes les améliorations d\'une caserne.',
    goal: (w) => [Math.max(0, ...w.buildings.filter((b) => b.kind === 'caserne').map((b) => b.upgrades.length)), UPGRADES.filter((u) => u.kinds.includes('caserne')).length], money: 50000, xp: 1500,
  },
  { id: 'sans_panne', title: 'Mécanique bien huilée', detail: 'Trente jours sans panne avec au moins cinq véhicules.', goal: (w) => [w.units.length >= 5 ? shiftDay(w) - w.records.lastBreakdownDay : 0, 30], money: 20000, xp: 600 },
  // ------------------------------------------------ carrière
  { id: 'niveau_10', title: 'Niveau 10', detail: 'Atteindre le niveau 10.', goal: (w) => [w.level, 10], money: 10000, xp: 0 },
  { id: 'niveau_25', title: 'Au sommet', detail: 'Atteindre le niveau 25.', goal: (w) => [w.level, 25], money: 100000, xp: 0 },
  { id: 'million', title: 'Budget d\'un million', detail: 'Avoir 1 000 000 € en caisse.', goal: (w) => [Math.floor(w.money), 1000000], money: 0, xp: 1000 },
  // ------------------------------------------------ crises
  { id: 'premiere_crise', title: 'Baptême du feu', detail: 'Réussir une intervention exceptionnelle.', goal: (w) => [w.records.crisesWon.length, 1], money: 10000, xp: 300 },
  {
    id: 'toutes_crises', title: 'Tout vu, tout géré', detail: 'Réussir chaque intervention exceptionnelle au moins une fois.',
    goal: (w) => [MAJORS.filter((k) => won(w, k.id)).length, MAJORS.length], money: 200000, xp: 5000,
  },
  ...MAJORS.map((k): Achievement => ({
    id: `crise_${k.id}`, title: k.title, detail: 'Réussir cette intervention exceptionnelle.', goal: (w) => [won(w, k.id) ? 1 : 0, 1], money: 5000, xp: 150,
  })),
];
