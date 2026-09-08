# Thème SonoRiva Marketing

Le thème rend les pages et leurs blocs WordPress. Le contenu édité est enregistré dans la base de données du site.

## Listes

Les blocs Liste reçoivent automatiquement des séparateurs et des coches. Le deuxième niveau utilise de petites puces avec un filet vertical, puis les niveaux suivants des tirets. Les listes ordonnées conservent leur numérotation, leur nombre de départ et leur ordre inversé éventuel. Les listes des menus et les indicateurs de disponibilité des forfaits conservent leur présentation spécifique.

Dans la barre du bloc Liste, utiliser les commandes d’indentation pour créer ou retirer un sous-niveau. Le style apparaît dans l’éditeur et sur le site.

## Formats de texte

Sélectionner des mots dans un titre, un paragraphe ou un élément de liste. Ouvrir le menu des formats de texte de la barre d’outils (la flèche près de Gras, Italique et Lien), puis choisir :

- **SonoRiva · Accent** : couleur d’accent et graisse renforcée.
- **SonoRiva · Surlignage** : fond bleu derrière la sélection.
- **SonoRiva · Souligné** : trait épais sous les mots.
- **SonoRiva · Nuance** : italique de graisse légère.

Sélectionner de nouveau le texte et cliquer sur le même format pour le retirer. Les formats peuvent être combinés. La taille et le niveau du titre restent ceux du bloc. Les couleurs s’adaptent aux sections sombres du thème.

Les formats utilisent des éléments `span` avec les classes `sr-text-accent`, `sr-text-highlight`, `sr-text-underline` et `sr-text-nuance`. Leur apparence est définie dans `assets/css/editorial.css`. Les commandes de l’éditeur sont déclarées dans `assets/js/editor-formats.js`.

## Déploiement

Le script `scripts/deploy-wordpress-plans.sh` déploie le thème et le bloc des forfaits. Les formats de texte ne nécessitent aucune compilation.
