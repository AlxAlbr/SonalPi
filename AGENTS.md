# AGENTS.md — notes à l'attention des agents

## Tests : ne retéléchargez JAMAIS les images Docker

Les images et volumes Nextcloud des bancs (`docker/compose-*.yml`) sont déjà en place :
`npm run nc:up` / `npm run nc-b:up` suffisent à les démarrer. Pas de `pull`, pas de
re-provisioning ; sans serveur, les bancs concernés se sautent tout seuls.
