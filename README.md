# PALFINGER — Atelier 3D

Atelier interactif de la PK 53002 SH, en français, adapté au téléphone et au PC.

**Projet indépendant et non officiel, sans affiliation ni validation par PALFINGER.** La mécanique est une reconstruction illustrative : ce modèle n’est ni un fichier CAO constructeur, ni un simulateur de levage. PALFINGER et son logo restent la propriété de leurs titulaires.

[Ouvrir l’atelier](https://cleementt26.github.io/palfinger-atelier-3d/) · [Dépôt GitHub](https://github.com/cleementt26/palfinger-atelier-3d)

## Développement et compilation

L’application fonctionne entièrement dans le navigateur avec React, Three.js et Vite. Aucun compte, serveur applicatif, service de données ou variable d’environnement n’est nécessaire. Les images et le logo sont inclus dans le dépôt.

Prérequis : **Node.js 22.13 ou plus récent** et **pnpm 11.25.0**. Le fichier `pnpm-lock.yaml` verrouille les versions et les intégrités des dépendances.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Commandes de vérification et de production :

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

`pnpm build` contrôle TypeScript puis génère le site statique dans **`docs/`**. `pnpm preview` sert cette compilation pour la vérifier localement ; ouvrez l’adresse affichée par Vite. Utilisez un serveur HTTP, plutôt que d’ouvrir `index.html` directement comme fichier.

### Publication GitHub Pages

Le dépôt utilise la publication depuis une branche : dans **Settings → Pages**, sélectionner **Deploy from a branch**, puis **`main`** et **`/docs`**. Aucun workflow GitHub Actions n’est nécessaire.

Après toute modification du code ou des assets, exécuter les tests et `pnpm build`, puis committer et pousser les sources ainsi que le dossier `docs/` mis à jour. GitHub Pages publiera le contenu de ce dossier.

La configuration Vite utilise `base: "./"`, et les images ainsi que le favicon ont des chemins relatifs : le site fonctionne sous le chemin de projet `/palfinger-atelier-3d/`. `public/.nojekyll` est copié dans `docs/` lors du build pour servir directement les fichiers statiques.

### Organisation

- `index.html`, `main.tsx` : page française et point d’entrée React.
- `components/crane/` : atelier et visualiseur 3D.
- `lib/crane-kinematics.ts` : géométrie, fermetures des renvois et moteur de mouvement.
- `lib/crane-model.ts`, `lib/crane-data.ts` : modèle Three.js et données documentées.
- `components/ui/`, `lib/utils.ts` : quatre composants d’interface et utilitaires.
- `app/globals.css`, `vendor/` : styles et dépendance CSS locale avec sa licence.
- `public/brand/`, `public/reference/` : logo officiel et image de référence.
- `tests/` : huit tests de mécanique exécutés avec le moteur natif de Node.js.
- `docs/` : copie compilée et versionnée pour GitHub Pages.

## Mouvement et inspection

- Deux renvois à quatre barres résolus par fermeture géométrique : colonne/bras principal et principal/secondaire.
- Biellettes de longueur constante, axes des yeux de vérins coaxiaux aux broches sous toute orientation de la tourelle.
- Corps de vérins et tiges rigides ; la partie rentrée de la tige est masquée par le fût opaque. Aucun redimensionnement axial des solides.
- Six télescopes actifs, sections creuses et recouvrement minimal de 0,72 unité de reconstruction. Chaque étage a son propre actionneur.
- L’adaptateur terminal suit le dernier télescope ; seul le crochet suspendu reste vertical, sans simulation de balancement.
- Commandes indépendantes du bras principal, du coude, du télescopage et de la rotation continue de colonne.
- Séquence guidée en quatre phases, lecture dans les deux sens, pause et vitesses de présentation ×0,25 / ×0,5 / ×1.
- Retour du mode manuel vers la séquence par rentrée des extensions, relèvement puis repli, sans saut de position.
- Calcul des mouvements selon le temps écoulé, indépendant de la fréquence du rendu. Tracé du crochet, transparence des structures et axes visibles, gros plan sur le renvoi choisi.
- Affichage des angles réellement dessinés, des courses relatives des vérins et de la sortie de chaque télescope.
- Sur téléphone, la vue reste visible au-dessus des commandes pendant le défilement.
- Rendu WebGL avec ombres, secours 3D SVGRenderer si WebGL est indisponible. Rendu au repos suspendu et mises à jour de mesures limitées aux changements.

## Ce qui est documenté et ce qui est reconstruit

La brochure PALFINGER propre à la PK 53002 SH décrit Power Link Plus : le second bras dépasse de **15° le prolongement du premier** (p. 6). L’angle β est donc relatif au premier bras, et son orientation absolue est α + β. La rotation de colonne est continue. PALFINGER décrit un double système de renvoi.

Les plans publics trouvés ne donnent pas les coordonnées complètes des pivots, les longueurs entre axes, les courses exactes ni la loi hydraulique de sortie des télescopes. Les dimensions internes de ce projet sont des hypothèses de reconstruction cohérentes. Les angles α = 0…82° et β = −155…+15° sont les bornes de la maquette ; seule la surarticulation de +15° est documentée. Les courses affichées sont des pourcentages de la plage du modèle, pas des valeurs mesurées sur la machine.

L’ordre de sortie successif et les vitesses servent à examiner la mécanique ; ils ne reproduisent pas une procédure opérateur, P-Fold, Soft Stop, S-HPLS ou PALTRONIC. Les stabilisateurs restent déployés. Le contrôle de dégagement utilise le sol et une enveloppe simplifiée de colonne ; ce n’est pas un moteur de collision complet, une étude de stabilité ou une fonction de sécurité.

Aucune charge admissible n’est calculée. La portée réelle ne se déduit pas des proportions de la maquette. Les maxima 18,2 t et 21 m sont distincts. Les versions A–G n’identifient pas la configuration exacte de la géométrie reconstruite. Masse standard : 4 145 kg dans la brochure, 4 155 kg sur la page produit ; divergence signalée.

## Sources primaires

- [Fiche PK 53002 SH](https://www.palfinger.com/fr/fr/nos-produits/grues/grues-chargement/modeles/pk-53002-sh.html)
- [Brochure française, Power Link Plus p. 6 et caractéristiques p. 11](https://www.palfinger.com/content/dam/palfinger/data/importdata/product-data/loader-cranes/brochures/pk-53002-sh/kphpk53002sm2fransicht.pdf)
- [Dessin d’encombrement officiel](https://s7g10.scene7.com/is/image/palfinger/pk53002sh_drawing)
- [Rendu constructeur utilisé comme référence](https://s7g10.scene7.com/is/image/palfinger/pk53002sh_title_2?wid=1800) — © PALFINGER, aucune licence permissive déclarée.
- [Site officiel PALFINGER](https://www.palfinger.com/worldwide/en.html) — logo SVG officiel extrait de l’en-tête (`a.header__logo`), conservé à l’identique dans `public/brand/palfinger-logo.svg`. Son rapport d’aspect natif est de 107 × 23 ; l’affichage conserve ce rapport sur PC et téléphone.

## Vérification

`node --experimental-strip-types --test tests/crane-kinematics.test.mjs`

Huit tests couvrent la fermeture des deux chaînes sur 2 001 angles chacune, l’absence de point mort dans les plages représentées, les pistons dans les fûts, les six courses et recouvrements, 4 001 positions de la séquence, les butées de démonstration, la continuité du retour depuis le mode manuel, la rotation au-delà de 360°, l’arrêt sans dérive après pause, et l’invariance du mouvement à 30/60/120 Hz.

Le contrôle TypeScript et la compilation Vite complètent ces tests. La vérification visuelle doit couvrir une largeur de téléphone et une largeur de bureau, ainsi que le chargement du logo et de la photo sous le chemin GitHub Pages. Le rendu WebGL dispose d’un secours interactif SVG si le contexte GPU n’est pas disponible ; les tests cinématiques ne vérifient pas le rendu graphique.

WebMCP est proposé uniquement si `document.modelContext` existe. Les outils retournent commande et pose affichée séparément, car les mouvements évoluent progressivement. Cette capacité est facultative et n’est pas nécessaire au fonctionnement du site.
