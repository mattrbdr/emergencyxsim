// The first steps, guided: each step reads the world and moves on by itself
// when the player has done it. Afterwards, one-off tips at key moments.
import { isTired } from './crews.ts';
import type { World } from './types.ts';

export interface Step {
  id: string;
  title: string;
  text: string;
  /** The testId of the control to highlight ('' for none). */
  hint: string;
  done: (w: World) => boolean;
}

export const STEPS: Step[] = [
  {
    id: 'build', title: 'Votre première caserne',
    text: 'Touchez le bouton Construire, choisissez Caserne, visez une route puis confirmez. Elle est offerte, avec un VSAV.',
    hint: 'open-build', done: (w) => w.buildings.length > 0,
  },
  {
    id: 'wait', title: 'En attente d\'appel',
    text: 'Les appels arrivent à la file de gauche (en bas sur téléphone). Accélérez le temps avec ×2 si besoin.',
    hint: '', done: (w) => w.calls.length > 0,
  },
  {
    id: 'qualify', title: 'Un appel entre',
    text: 'Touchez l\'appel dans la file, lisez ce que dit l\'appelant, puis choisissez la bonne famille d\'intervention.',
    hint: 'call', done: (w) => w.calls.some((c) => c.qualified),
  },
  {
    id: 'engage', title: 'Engager',
    text: 'Le véhicule le plus proche est suggéré : touchez « Engager la suggestion ».',
    hint: 'engage', done: (w) => w.calls.some((c) => c.assigned.length > 0),
  },
  {
    id: 'follow', title: 'Suivre l\'intervention',
    text: 'Le véhicule suit les vraies rues. À l\'arrivée, le chef d\'agrès fait un bilan : il peut vous demander une décision.',
    hint: '', done: (w) => w.calls.some((c) => c.outcome === 'sauve'),
  },
  {
    id: 'buy', title: 'Agrandir la flotte',
    text: 'Chaque intervention rapporte de l\'argent. Touchez votre caserne et achetez un second VSAV.',
    hint: 'buy-VSAV', done: (w) => w.units.length >= 2,
  },
];

export const TIPS: Record<string, { title: string; text: string }> = {
  bilan: { title: 'Bilan sur place', text: 'Le premier engin a découvert une situation différente. Demander le renfort est le plus sûr et paie mieux ; faire avec les moyens présents est risqué.' },
  debt: { title: 'Caisse dans le rouge', text: 'L\'entretien horaire dépasse vos recettes. Revendez un véhicule inutile ou enchaînez les interventions avant d\'acheter.' },
  level: { title: 'Nouveau niveau', text: 'Un nouveau véhicule est disponible. Achetez-le dans un bâtiment : ses interventions n\'arrivent qu\'une fois qu\'il est dans votre flotte.' },
  contracts: { title: 'Contrats du jour', text: 'Trois objectifs par jour (bouton drapeau en haut). Remplissez-les pour des primes et une série qui augmente vos gains.' },
  fatigue: { title: 'Équipage fatigué', text: 'Un équipage enchaîne les interventions : au-delà de 70 % de fatigue, il roule et travaille moins vite. Ouvrez sa fiche dans Flotte et mettez-le au repos quand le calme revient.' },
  breakdown: { title: 'Véhicule en panne', text: 'Plus un véhicule roule, plus il s\'use et risque la panne. Une révision depuis sa fiche coûte moins cher qu\'une réparation.' },
  coverage: { title: 'Couverture', text: 'Le bouton calques colore les rues selon le temps d\'arrivée depuis vos bases. Placez les suivantes là où c\'est rouge.' },
};

/** Moves the tutorial on, and queues a tip the first time its moment comes. */
export function updateTutorial(w: World) {
  while (w.tutorial < STEPS.length && STEPS[w.tutorial].done(w)) w.tutorial++;
  if (w.tutorial < STEPS.length) return;
  const want = (id: string, now: boolean) => {
    if (now && !w.tipsSeen.includes(id) && w.tip === '') w.tip = id;
  };
  want('contracts', w.contracts.length > 0);
  want('bilan', w.calls.some((c) => c.state === 'bilan'));
  want('debt', w.money < 0);
  want('level', w.level >= 2);
  want('coverage', w.buildings.length >= 1 && w.level >= 3);
  want('fatigue', w.units.some(isTired));
  want('breakdown', w.units.some((u) => u.status === 'atelier') || w.units.some((u) => u.wear > 60));
}

export function dismissTip(w: World) {
  if (w.tip) w.tipsSeen.push(w.tip);
  w.tip = '';
  w.dirty = true;
}

export function skipTutorial(w: World) {
  w.tutorial = STEPS.length;
  w.dirty = true;
}

/** What the view shows: the current step, or a tip. */
export function guide(w: World) {
  if (w.tutorial < STEPS.length) {
    const s = STEPS[w.tutorial];
    return { kind: 'step', title: s.title, text: s.text, hint: s.hint, index: w.tutorial + 1, total: STEPS.length };
  }
  if (w.tip) {
    const t = TIPS[w.tip];
    return { kind: 'tip', title: t.title, text: t.text, hint: '', index: 0, total: 0 };
  }
  return { kind: '', title: '', text: '', hint: '', index: 0, total: 0 };
}
