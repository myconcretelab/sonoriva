# Contrôleurs MIDI

L’accès MIDI se trouve dans **Paramètres → Commandes → Contrôleur MIDI**. Il permet d’utiliser des pads, des touches de clavier et des potentiomètres USB pour commander SonoRiva.

## Connexion et affectations

**Activer le MIDI** demande l’autorisation du navigateur. Sélectionnez ensuite le contrôleur dans **Entrée MIDI**. La liste suit les branchements et débranchements USB. Seule l’entrée sélectionnée commande l’application.

Pour créer une affectation, choisissez une **Commande à affecter**, cliquez sur **Apprendre une commande**, puis actionnez le contrôle physique. Un volume attend un message de potentiomètre MIDI CC ; les autres commandes acceptent les notes ou les CC. Une affectation remplace celle qui utilisait déjà le même contrôle sur le même canal et la même entrée. La liste des affectations permet de les supprimer individuellement.

Les affectations sont enregistrées dans le navigateur, par utilisateur, spectacle et entrée MIDI. La connexion doit être réactivée après le rechargement de l’application ou le changement de spectacle. **Désactiver le MIDI** suspend les commandes en conservant les affectations.

## Préréglage Akai APC Key 25 original

Le bouton **Préréglage APC Key 25 original** remplace les affectations de l’entrée sélectionnée.

| Contrôle | Commande |
| --- | --- |
| 40 pads, de gauche à droite et du haut vers le bas | Déclencher les 40 premiers morceaux visibles |
| Potentiomètre K1 | Volume maître |
| Potentiomètres K2 à K8 | Volume des sept premiers lecteurs affichés |
| Boutons flèche gauche et flèche droite | Catégorie précédente et suivante |
| Stop All Clips | Arrêter toutes les lectures avec leurs fondus |
| Play | Lancer ensemble les sons de la zone de départ rapide activée |

Les touches du piano et les autres boutons peuvent être affectés avec l’apprentissage. Ce préréglage vise le modèle original ; les potentiomètres relatifs du modèle mk2 ne sont pas pris en charge.

## Commandes disponibles

Un **morceau visible** suit sa position dans la catégorie ou les résultats de recherche, sous-catégorie ouverte comprise. Une affectation à un **morceau du spectacle** conserve ce morceau même lorsque la catégorie affichée change. Les départs utilisent l’action **Clavier** du spectacle : démarrer, fondu enchaîné, fondu d’entrée, remplacer, arrêter ou aucune action.

Les autres commandes sont l’arrêt global avec fondu ou immédiat, le changement de catégorie, le départ rapide, le volume maître et les volumes des huit premiers lecteurs. Un lecteur absent ou un morceau supprimé ne déclenche aucune action.

Les volumes CC absolus vont de 0 à 127 et sont convertis en 0 à 100 %. Le volume maître concerne le lecteur local, y compris lorsqu’il utilise le moteur audio Bridge. En mode télécommande, les départs et arrêts sont transmis au lecteur principal ; les potentiomètres ne règlent pas ses volumes à distance.

## Disponibilité et limites

L’accès utilise Web MIDI, disponible notamment dans Chrome et Edge sur ordinateur, en HTTPS ou sur localhost. L’application affiche un message lorsque le navigateur ou la fenêtre de régie locale ne propose pas cette API. Le contrôleur envoie des commandes ; les sons proviennent des fichiers du spectacle, sans synthétiseur MIDI intégré.

Les messages Note Off, les Note On de vélocité nulle et les relâchements de boutons CC sont ignorés. La vélocité des touches ne modifie pas le volume des sons. L’apprentissage ne lance pas la commande capturée. Les commandes sont suspendues pendant l’affichage d’un dialogue, la saisie dans un champ, la sélection des morceaux, l’édition de la disposition et lorsque l’onglet est masqué.

Les voyants du contrôleur ne reflètent pas l’état des lectures. Les messages SysEx, les encodeurs relatifs, les banques de pads et l’enregistrement de notes MIDI ne sont pas pris en charge.
