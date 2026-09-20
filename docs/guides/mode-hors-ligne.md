# Mode hors ligne

Le mode hors ligne stocke dans le navigateur les fichiers audio d’un spectacle et les ressources nécessaires à l’interface.

## Mise en cache

1. Ouvrir le spectacle concerné avec une connexion réseau active.
2. Ouvrir **Paramètres → Bibliothèque**.
3. Exécuter **Rendre disponible hors ligne**.
4. Attendre la fin de la progression.

Chaque fichier audio est téléchargé puis ajouté au cache du navigateur. La confirmation indique que l’opération est terminée.

## Lecture

Lorsqu’un média est présent dans le cache, SonoRiva utilise cette copie locale pour la lecture. Une requête réseau reste nécessaire pour un média absent du cache.

La liste des spectacles et les dernières données consultées sont également conservées localement. Les modifications et imports restent des opérations serveur et ne sont pas disponibles sans connexion.

## Périmètre du stockage

Le cache appartient :

- au navigateur utilisé ;
- au profil du navigateur ;
- à l’appareil ;
- au domaine de SonoRiva.

La mise en cache d’un spectacle sur un appareil ne le rend pas disponible sur les autres appareils. Une fenêtre privée utilise un stockage séparé qui peut être supprimé à sa fermeture.

## Suppression du cache

Les fichiers hors ligne disparaissent lorsque les données du site ou le cache de SonoRiva sont supprimés. Le navigateur peut également libérer cet espace selon sa politique de stockage.

Le cache hors ligne est distinct du stockage serveur et ne constitue pas une copie de sauvegarde des projets.

## Forme d’onde et préécoute

L’éditeur cherche le son dans le cache du navigateur, puis dans le cache du Bridge associé (version 1.0.10 ou ultérieure). Si aucun fichier local n’est accessible, il le télécharge depuis le serveur. La forme d’onde et la préécoute Web Audio utilisent le même fichier ; elles fonctionnent sans Internet quand celui-ci est disponible localement. Le Bridge doit être ouvert pour accéder à son cache. Les anciennes versions du Bridge nécessitent un fichier déjà présent dans le cache du navigateur ou une connexion au serveur.
