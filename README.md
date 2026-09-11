# Lab — Agence Absolu

Hub des démonstrations techniques publiées sur **lab.agence-absolu.com**.

Deux fichiers, sans dépendance : ni `npm install`, ni build.

- `hub.js` — le hub lui-même : liste les démos en ligne sur `/` et sert chacune
  d'elles sur `/<slug>/` ;
- `server.js` — l'amorceur : ouvre le port, délègue chaque requête à `hub.js`
  et le réimporte dès qu'une nouvelle version est déposée sur le disque.

```bash
npm start            # http://localhost:3000
PORT=8080 npm start  # autre port
```

## Comment ça marche

Les démos ne vivent **pas** dans ce dépôt. Elles sont déposées, chacune dans son
dossier, dans `lab-projects/` — un dossier à part, ignoré par git, que le hub se
contente de lire :

| Rôle | Chemin |
| --- | --- |
| Code du hub | `~/lab.agence-absolu.com/` |
| Dossier des démos | `~/lab.agence-absolu.com/lab-projects/` |
| Une démo | `~/lab.agence-absolu.com/lab-projects/<slug>/` |
| URL publique | `https://lab.agence-absolu.com/<slug>/` |

`lab-projects/` n'apparaît pas dans les URL. Ce rangement sépare les deux cycles
de vie : le hub peut être redéployé, nettoyé ou reconstruit sans emporter les
démos, et son propre code, hors du dossier servi, n'est pas exposé au web.

Règles imposées par `hub.js` :

- un dossier est une démo dès qu'il contient un `index.html` ;
- le slug est en minuscules : lettres, chiffres, tirets (`/^[a-z0-9][a-z0-9-]*$/`) ;
- les fichiers et dossiers cachés (`.git`, `.env`…) ne sont jamais servis ;
- une URL sans extension qui ne correspond à aucun fichier retombe sur
  l'`index.html` de la démo (routage côté client) ; une URL avec extension
  absente répond 404 ;
- `index.html` est revalidé à chaque visite, le reste est mis en cache un an —
  les bundles doivent donc porter une empreinte dans leur nom (Vite le fait).

**Le déploiement du hub ne doit jamais toucher à `lab-projects/`** — une
exclusion s'il passe par `rsync --delete`.

Variables d'environnement : `PORT` (défaut `3000`), `LAB_PROJECTS_DIR` (défaut
`./lab-projects`).

## Déployer le hub

`.github/workflows/deploy.yml` envoie `hub.js`, `server.js`, `package.json` et ce
README par rsync sur SSH dans `~/lab.agence-absolu.com/` à chaque push sur `main`
(ou à la demande, onglet Actions), avec les mêmes quatre secrets que les démos
(voir plus bas). Sans `--delete` : `lab-projects/` n'est jamais touché.

**Pas de redémarrage** : `server.js` sonde `hub.js` toutes les deux secondes et
le réimporte dès que rsync en dépose une nouvelle version — le nouveau code
sert dans les secondes qui suivent le push. Si la nouvelle version ne se charge
pas (erreur de syntaxe…), l'ancienne continue de servir et l'erreur est dans la
console du site.

C'est la seule voie possible chez Infomaniak : il n'existe pas d'API publique
pour redémarrer un site Node.js, et le shell SSH vit dans un conteneur à part,
sans vue sur le processus de l'application — impossible de le tuer pour le
faire relancer. Corollaire : **une modification de `server.js` exige encore un
redémarrage manuel** depuis le Manager (site Node.js › tableau de bord). Il est
fait pour ne plus changer.

## Ajouter une démo

Le hub ne bouge pas, aucune configuration serveur n'est touchée. Une démo est un
projet Vite autonome, dans son propre dépôt, qui se publie tout seul dans
`lab-projects/<slug>/` à chaque push sur `main`. Le modèle est
[`lab-drill`](https://github.com/agence-absolu/lab-drill).

### 1. Le projet

Le **slug** est le nom npm du projet (`"name"` dans `package.json`). Il doit
respecter le format ci-dessus ; c'est lui qui donne l'URL finale.

`vite.config.js` en déduit la base des chemins — rien à nommer dans le fichier,
il se recopie tel quel :

```js
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Servi depuis lab.agence-absolu.com/<slug>/ ; le slug est le nom npm.
// BASE_PATH surcharge au besoin (racine de domaine : BASE_PATH=/).
const { name } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: process.env.BASE_PATH || `/${name}/`,
});
```

### 2. Le workflow

Recopier `.github/workflows/deploy.yml` de `lab-drill` sans le modifier. Il :

1. lit le slug dans `package.json` ;
2. `npm ci` puis `npm run build` avec `BASE_PATH=/<slug>/` ;
3. envoie `dist/` par **rsync sur SSH** (mot de passe via `sshpass`) dans
   `lab.agence-absolu.com/lab-projects/<slug>/`, avec `--delete` pour purger
   les bundles de la version précédente.

Il se déclenche à chaque push sur `main` et à la demande depuis l'onglet Actions.

### 3. Les secrets

Dans le dépôt GitHub, Settings › Secrets and variables › Actions :

| Secret | Contenu |
| --- | --- |
| `LAB_SSH_HOST` | hôte SSH Infomaniak (`…ssh.hosting-ik.com`) |
| `LAB_SSH_USER` | compte SSH |
| `LAB_SSH_PASSWORD` | mot de passe |
| `LAB_SSH_KNOWN_HOSTS` | facultatif — sortie de `ssh-keyscan <hôte>`, pour épingler l'empreinte du serveur |

Pourquoi un mot de passe et pas une clé : chez Infomaniak, l'authentification par
clé n'est pas disponible sur un site Node.js et le port FTP est filtré. Le jour
où la clé sera possible, `sshpass -e` se remplace par une clé déployée.

### 4. Pousser

Premier push sur `main` : le workflow compile, envoie, et la démo apparaît sur
la page d'accueil du lab. Rien d'autre à faire.

En local :

```bash
npm run dev       # http://localhost:5173/<slug>/
npm run build     # compile dans dist/
npm run preview   # prévisualise dist/ sur le même sous-chemin
```

## À venir

Les étapes 1 à 3 sont du copier-coller : un générateur `npm create absolu-lab`
(dépôt `create-absolu-lab`) devrait initialiser un projet Vite avec le
`vite.config.js`, le workflow et un `README` rappelant les secrets à créer.
