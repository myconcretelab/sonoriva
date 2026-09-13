# Utilisateurs du compte

Un compte correspond à un forfait et à un quota de stockage commun. Chaque utilisateur se connecte avec son adresse e-mail et son mot de passe. Le titulaire conserve la gestion du forfait et des utilisateurs.

## Gestion des utilisateurs

Dans **Paramètres → Compte → Utilisateurs du compte**, le titulaire crée un utilisateur avec un nom, une adresse e-mail et un mot de passe initial. Aucun e-mail d’invitation n’est envoyé. La fonction **Mot de passe oublié** permet à chaque utilisateur de définir un nouveau mot de passe.

**Désactiver** bloque les connexions d’un utilisateur et conserve ses données. **Réactiver** rétablit son accès dans la limite du forfait. Un utilisateur désactivé reste compté dans cette limite.

**Retirer** supprime son accès au compte et ses spectacles après confirmation. Ses copies de sons disparaissent ; les copies présentes chez d’autres utilisateurs sont conservées. Son identité reste enregistrée pour l’historique et le support ; son adresse e-mail ne peut pas être utilisée pour créer une autre identité. Le titulaire ne peut pas être retiré depuis cet écran.

## Espaces personnels

Les spectacles, catégories, playlists et sons appartiennent à leur utilisateur. Les spectacles existants sont attribués au titulaire lors de la mise à jour. La limite de spectacles s’applique aux spectacles personnels de chaque utilisateur ; les spectacles reçus en partage ne consomment pas cette limite.

Les mises en page personnalisées et leurs variantes sont enregistrées par utilisateur dans le navigateur. Elles restent disponibles après déconnexion sur ce navigateur, sans synchronisation automatique entre appareils. Le skin choisi est également enregistré par utilisateur sur cet appareil.

## Partage des spectacles

Dans **Paramètres → Spectacle → Partage du spectacle**, le propriétaire sélectionne les autres utilisateurs du compte, puis clique sur **Enregistrer le partage**. Les spectacles restent privés tant qu’aucun destinataire n’est sélectionné.

Un destinataire retrouve le spectacle dans sa liste, avec la mention **Partagé avec vous** dans les paramètres. Il peut le lire et modifier ses sons, catégories, playlists, couleurs et réglages. Tous les participants accèdent au même spectacle : les changements sont communs, sans duplication du spectacle, des fichiers ou du stockage. Les mises en page de l’espace de travail restent personnelles au navigateur et à l’utilisateur.

Seul le propriétaire peut modifier les destinataires ou supprimer le spectacle. Décocher un utilisateur puis enregistrer retire son accès au spectacle sur le serveur. Les sons déjà copiés dans son propre espace restent indépendants. Les téléchargements hors ligne existants ne peuvent pas être retirés à distance tant que l’appareil reste hors ligne.

La suppression du propriétaire depuis le compte supprime aussi ses spectacles partagés. Le partage nécessite que la gestion multiutilisateur soit activée dans le forfait. À `0`, les accès partagés sont suspendus ; les destinataires enregistrés sont conservés et peuvent être retirés par le propriétaire.

Les spectacles partagés sont également accessibles depuis le Bridge associé à un destinataire connecté. La règle d’une seule session active par compte continue de s’appliquer.

## Copie de sons

La section **Copier des sons entre utilisateurs** permet de choisir l’utilisateur source, les sons et un spectacle de destination. Un utilisateur peut envoyer ses sons à un autre membre du compte ou copier les sons d’un membre vers son propre spectacle. Une opération accepte jusqu’à 500 sons.

Chaque copie conserve les réglages du son et arrive sans catégorie dans le spectacle de destination. Son nom et ses réglages peuvent ensuite être modifiés indépendamment. Le fichier audio ou vidéo reste commun : il n’est ni dupliqué ni recompté dans le quota de stockage. La copie reste possible lorsque le quota est plein, si le compte autorise les modifications.

Supprimer un son ou un spectacle ne supprime le fichier que lorsque plus aucun son ne le référence. La copie ne crée pas de lien de synchronisation entre les noms, les catégories ou les réglages.

## Session active

Une seule session de connexion est active par compte. Une nouvelle connexion, y compris avec le même utilisateur, remplace la précédente. L’ancienne session reçoit une notification en temps réel et ses lectures s’arrêtent. Un contrôle complémentaire est effectué toutes les quinze secondes, au retour sur la fenêtre et au rétablissement du réseau.

Les onglets partageant le même cookie utilisent la même session. Une télécommande ouverte dans un autre navigateur nécessite une nouvelle connexion et remplace donc la précédente.

Un appareil hors ligne ne peut pas recevoir une déconnexion à distance. Les médias déjà téléchargés peuvent continuer à être lus hors ligne ; la session est vérifiée au retour du réseau. Le Bridge est associé à un utilisateur et les accès à ses spectacles sur le serveur nécessitent une session active de cet utilisateur.

## Limite du forfait

Dans l’administration des forfaits, **Nombre maximal d’utilisateurs** accepte une valeur de `0` à `1000`, titulaire inclus. `0` désactive la gestion multiutilisateur et le partage ; le titulaire garde son accès. Les forfaits existants reçoivent initialement la valeur `0`.

Une baisse de limite conserve les données. Le titulaire et les utilisateurs les plus anciens dans la limite restent autorisés ; les autres sont indiqués **Hors limite du forfait**. Relever la limite rétablit leur éligibilité. Le titulaire peut retirer des utilisateurs pour libérer des places.
