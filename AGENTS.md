# Instructions du dépôt

- Chaque modification effectuée dans ce dépôt doit être vérifiée, puis suivie d’un commit Git et d’un push sur la branche distante correspondante.
- Ne jamais laisser de modification produite par l’agent non commitée ou non poussée. Si le commit ou le push est bloqué, signaler clairement la cause.
- Regrouper les changements cohérents dans des commits ciblés avec des messages explicites.
- Avant chaque commit, exécuter les vérifications adaptées au changement. Pour une modification applicative complète, exécuter au minimum `npm run typecheck`, `npm run lint`, `npm test` et `npm run build`.
- Après chaque push réussi sur `main`, déployer immédiatement la version poussée sur Alwaysdata avec `./scripts/deploy-alwaysdata.sh`.
- Le déploiement doit appliquer les migrations, redémarrer le site et vérifier `https://app.sonoriva.fr/api/health`. Si une étape échoue, ne pas masquer l’échec et en signaler précisément la cause.
- Ne jamais afficher, copier dans le dépôt ou inclure dans une commande journalisée les secrets Alwaysdata. Le jeton d’API doit rester dans le trousseau Apple sous le service `sonoriva-alwaysdata-api` et le compte `myconcretelab`.
- La documentation utilisateur doit rester factuelle et décrire uniquement le fonctionnement, les commandes, les paramètres et les limites. Ne pas y ajouter de conseils de conduite, de bonnes pratiques, de checklists ni de formulations paternalistes.

- Toute modification d’interface doit être adaptée et vérifiée dans les quatre thèmes de l’application : Original, Studio, Porcelain et Tape. Utiliser les variables de thème et vérifier les contrastes des textes et icônes, les états actifs et les dispositions responsive.
