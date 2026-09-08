# Diaporama SonoRiva

Extension WordPress 1.1.0 installée sur `sonoriva.fr`. Elle ajoute les blocs `sonoriva/slider` (Diaporama SonoRiva) et `sonoriva/slide` (Diapositive SonoRiva). Elle fonctionne indépendamment de l’extension des forfaits.

## Utilisation

Dans l’éditeur WordPress, insérer **Diaporama SonoRiva**, puis utiliser **Ajouter des images** pour sélectionner plusieurs images dans la médiathèque. Chaque diapositive possède une image, un texte alternatif, une légende modifiable et un texte superposé facultatif. L’ordre se modifie avec les commandes de déplacement des blocs.

Les réglages du diaporama proposent :

- Fondu, glissement horizontal, glissement vertical, zoom doux ou aucune animation.
- Durée de transition : 250, 450 ou 700 ms.
- Formats : 4:3, 16:9, carré ou portrait 3:4.
- Cadrage : image entière ou remplissage du cadre.
- Nom accessible du diaporama.

La navigation utilise les flèches, les repères, les touches gauche/droite lorsque le diaporama a le focus et le balayage tactile. Il n’y a pas de défilement automatique. Les animations sont désactivées lorsque la préférence système de réduction des mouvements est active. Sans JavaScript, les images s’affichent à la suite.

## Structure

- `sonoriva-slides.php` : déclaration des blocs et des ressources ; ajout des paramètres de transition au rendu.
- `slider/block.json`, `slide/block.json` : métadonnées des blocs.
- `editor.js`, `editor.css` : interface d’édition.
- `view.js`, `style.css` : affichage public et transitions.
- `test-transitions.cjs` : scénarios de transitions, interruptions, boucle et réduction des mouvements.

Le contenu des images et légendes est enregistré dans les blocs de la page WordPress. Il n’est pas inclus dans ce répertoire. La version 1.1.0 conserve le balisage enregistré par la version 1.0.0.

## Vérification

Depuis la racine du dépôt :

```sh
php -l wordpress/sonoriva-slides/sonoriva-slides.php
node --check wordpress/sonoriva-slides/editor.js
node --check wordpress/sonoriva-slides/view.js
node wordpress/sonoriva-slides/test-transitions.cjs
```

## Installation ou mise à jour

Compresser le dossier `sonoriva-slides`, puis utiliser **Extensions → Ajouter → Téléverser une extension** dans WordPress. Activer l’extension lors de la première installation, ou remplacer la version existante lors d’une mise à jour.

WordPress 6.3 ou supérieur est requis. Le bloc utilise les bibliothèques fournies par WordPress et ne nécessite pas de compilation. Le script `scripts/deploy-wordpress-plans.sh` ne déploie pas cette extension.
