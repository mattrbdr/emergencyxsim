# emergencyxsim

Simulateur de services d'urgence (police, pompiers, ambulances) construit avec
[Exact](https://github.com/expo/exact) : une seule source pour le web, iOS, macOS,
Android et Linux.

## Prérequis

Une copie d'Exact **à côté** de ce dépôt (Exact n'a pas de paquet npm, une app
l'utilise par son chemin) :

```sh
git clone https://github.com/expo/exact ../exact
bun ../exact/scripts/exact.mjs setup     # une seule fois
bun exact.mjs --help                      # crée le lien .exact/checkout
```

## Lancer

```sh
bun exact.mjs web          # serveur de dev : http://127.0.0.1:8765/
bun exact.mjs web --lan    # même chose, ouvrable depuis un iPhone sur le même Wi-Fi
bun exact.mjs test web     # tests app.test.contract
bun exact.mjs verify       # build + tests + vérifications (clair/sombre, largeurs, accessibilité)
```

Fichiers : `app.contract` (interface, langage Contract d'Exact), `app.ts` (données),
`app.test.contract` (tests), `app.json` (manifeste).
