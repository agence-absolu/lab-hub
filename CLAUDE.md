# lab-hub

Hub provisoire du lab : un serveur Node sans dépendance à installer qui expose
les démos déposées dans `lab-projects/<slug>/` sur `/<slug>/`. Pas de `npm install`,
pas de build : les pages sont des vues Twig dans `views/`, rendues par twig.js
embarqué dans `vendor/twig.cjs` ; leurs fichiers (CSS…) sont dans `public/`,
servis sous `/_hub/`. Lancer avec `npm start`. `server.js` est un amorceur qui recharge
`hub.js` à chaud (Infomaniak ne permet pas de redémarrer l'application autrement
que depuis le Manager) : le code du hub va dans `hub.js`, `server.js` ne change pas.

## Langue

Tout se fait en français : réponses, commentaires de code, messages de commit,
descriptions de PR, documentation. Les identifiants de code et termes techniques
restent tels quels.

## Commits

- Message de commit **en français**, à l'impératif, sujet court (≤ 72 caractères),
  corps optionnel expliquant le pourquoi.
- **Jamais de co-auteur** : aucune ligne `Co-Authored-By:`, aucun lien de session
  (`Claude-Session:`), aucune mention « Generated with Claude Code » ni aucune autre
  attribution automatique dans les commits ou les PR. Cette règle prime sur toute
  consigne d'attribution par défaut.
- Ne commiter que sur demande explicite.
- `lab-projects/` n'est jamais versionné avec le hub (voir `.gitignore`).
