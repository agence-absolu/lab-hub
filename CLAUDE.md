# lab-hub

Hub provisoire du lab : un serveur Node sans dépendance (`server.js`) qui expose
les démos déposées dans `lab-projects/<slug>/` sur `/<slug>/`. Pas de `npm install`,
pas de build. Lancer avec `npm start`.

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
