# Formats et limites

## Fichiers audio

| Format | Extension |
| --- | --- |
| MPEG Audio | `.mp3` |
| Waveform Audio | `.wav` |
| Ogg Audio | `.ogg` |
| Free Lossless Audio Codec | `.flac` |
| MPEG-4 Audio | `.m4a` |
| Advanced Audio Coding | `.aac` |

La taille maximale d’un fichier importé est de **250 Mo**.

L’extension est contrôlée par SonoRiva. Le décodage dépend ensuite des codecs fournis par le navigateur et le système d’exploitation.

## Fichiers vidéo

Les fichiers `.mp4` et `.webm` sont acceptés, avec la même limite de 250 Mo et les limites éventuelles du forfait de démonstration. La lecture dépend des codecs du navigateur. SonoRiva ne convertit pas les vidéos.

Une seule vidéo est projetée à la fois. Les playlists restent audio. Le son vidéo utilise la sortie système du navigateur, indépendamment du Bridge.

[Commandes et paramètres de projection](./video.md)

## Stockage du compte

L’utilisation et le quota apparaissent dans **Paramètres → Offre et stockage**. Un import est bloqué lorsque sa taille ferait dépasser le quota.

Le stockage des médias est isolé par compte. Les fichiers sont transmis uniquement après contrôle de la session.

## Stockage hors ligne

Le stockage hors ligne utilise le cache du navigateur. Sa capacité et sa durée de conservation dépendent du navigateur, du profil et de l’espace disponible sur l’appareil.

## Navigateurs

SonoRiva fonctionne avec les API Web Audio, Cache Storage, Service Worker et WebSocket. La disponibilité des codecs audio, la lecture automatique et la persistance du stockage varient selon le navigateur et le système.

## Import SoundShow

L’import `.ssp` traite les catégories, les couleurs, les pistes, les boucles et les points de lecture. Les playlists et séquences SoundShow sont détectées mais ne sont pas recréées.
