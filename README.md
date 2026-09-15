# Lab — Agence Absolu

Hub des démonstrations techniques publiées sur **lab.agence-absolu.com**.

Sans rien à installer : ni `npm install`, ni build.

- `hub.js` — le hub lui-même : liste les démos en ligne sur `/` et sert chacune
  d'elles sur `/<slug>/` ;
- `server.js` — l'amorceur : ouvre le port, délègue chaque requête à `hub.js`
  et le réimporte dès qu'une nouvelle version est déposée sur le disque ;
- `views/` — les pages du hub, en Twig (`layout.twig` et une vue par page) ;
- `public/` — les fichiers du hub (`hub.css`…), servis sous `/_hub/` ;
- `vendor/twig.cjs` — [twig.js](https://github.com/twigjs/twig.js) 3.0.0, le
  build autonome du paquet npm, embarqué tel quel (licence BSD-2-Clause) pour
  ne pas dépendre d'un `npm install` sur le serveur.

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

### Les vues

Les pages sont rendues par twig.js depuis `views/`. Chaque vue est enregistrée
sous son nom de fichier (`{% extends 'layout.twig' %}`), avec l'auto-échappement
activé. Une vue modifiée sur le disque est relue à la requête suivante, sans
toucher à `hub.js`. Les listes sont triées par date de dernière modification
(celle du fichier le plus récent de la démo), la plus récente en tête.

Les fichiers de `public/` sont servis sous `/_hub/` (`/_hub/hub.css`) : le
souligné n'est pas admis dans un slug, aucune démo ne peut prendre ce chemin.
Ils sont revalidés à chaque visite (ETag), pas figés en cache.

twig.js couvre l'essentiel de Twig, pas tout (quelques filtres et fonctions
manquent, pas de `{% use %}`) ; le filtre `date` ignore le fuseau, les dates
sont donc formatées côté `hub.js`, en heure de Paris.

Variables d'environnement : `PORT` (défaut `3000`), `LAB_PROJECTS_DIR` (défaut
`./lab-projects`).

## Déployer le hub

`.github/workflows/deploy.yml` envoie `public/`, `vendor/`, `views/`, puis `hub.js`,
`server.js`, `package.json` et ce README par rsync sur SSH dans
`~/lab.agence-absolu.com/` à chaque push sur `main` (ou à la demande, onglet
Actions), avec les mêmes quatre secrets que les démos (voir plus bas). Sans
`--delete` : `lab-projects/` n'est jamais touché. Les vues et la bibliothèque
partent en premier : `hub.js` est rechargé dès son arrivée et doit les trouver.

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
projet Vite autonome, dans son propre dépôt GitHub, qui se publie tout seul dans
`lab-projects/<slug>/` à chaque push sur `main`. Le générateur
[`@absolu/create-lab-project`](https://github.com/agence-absolu/create-lab-project)
([npm](https://www.npmjs.com/package/@absolu/create-lab-project)) produit ce
projet en une commande.

Prérequis : Node ≥ 22, `git`, et [`gh`](https://cli.github.com/) connecté à
l'organisation `agence-absolu`.

### 1. Générer le projet

```bash
npm create @absolu/lab-project@latest
```

Le générateur pose trois questions — slug, titre, description — puis crée le
dossier `./<slug>/`. Sans question, tout se passe en arguments :

```bash
npm create @absolu/lab-project@latest -- ma-demo --title "Ma démo" -d "Ce qu'elle montre" --yes
```

| Option | Rôle |
| --- | --- |
| `[slug]` | nom npm du projet, donc l'URL finale `/<slug>/` |
| `--title <texte>` | titre de la démo (défaut : « Ma démo ») |
| `-d, --description <texte>` | description (balise `meta` et README) |
| `--dir <dossier>` | dossier de destination (défaut : `./<slug>`) |
| `--no-git` | ne pas initialiser de dépôt git |
| `-y, --yes` | accepter les valeurs par défaut sans poser de question |

Le **slug** est le nom npm du projet (`"name"` dans `package.json`). Il doit
respecter le format imposé par le hub — minuscules, chiffres, tirets
(`/^[a-z0-9][a-z0-9-]*$/`) — et c'est lui, seul, qui donne l'URL : rien n'est à
nommer ailleurs.

Le projet généré contient tout ce que le hub attend :

- `vite.config.js` — déduit la base des chemins (`/<slug>/`) du nom npm ;
  `BASE_PATH` la surcharge au besoin (`BASE_PATH=/` pour une racine de domaine) ;
- `.github/workflows/deploy.yml` — compile et publie `dist/` sur le lab (voir
  plus bas) ;
- `index.html`, `src/main.js`, `src/style.css` — une page minimale (titre,
  description), sans dépendance autre que Vite ;
- `README.md` et `CLAUDE.md` — rappellent les règles du hub et le déploiement ;
- `.gitignore` et un dépôt git initialisé, sans commit.

### 2. Développer

```bash
cd <slug>
npm install
npm run dev       # http://localhost:5173/<slug>/
npm run build     # compile dans dist/
npm run preview   # prévisualise dist/ sur le même sous-chemin
```

Le serveur de développement sert déjà la démo sous `/<slug>/`, comme en
production : les chemins absolus se vérifient en local.

### 3. Créer le dépôt

```bash
git add -A && git commit -m "Initialiser la démo"
gh repo create agence-absolu/lab-<slug> --public --source=. --push
```

**Public, obligatoirement** : les secrets SSH sont définis au niveau de
l'organisation `agence-absolu`, et GitHub ne les partage qu'avec les dépôts
publics (limite du plan gratuit). Un dépôt privé verrait son workflow échouer
faute de secrets.

### 4. Les secrets

Rien à créer dans le dépôt : le workflow lit les secrets de l'organisation
(Settings de l'organisation › Secrets and variables › Actions). Ce sont les
mêmes que pour le hub :

| Secret | Contenu |
| --- | --- |
| `LAB_SSH_HOST` | hôte SSH Infomaniak (`…ssh.hosting-ik.com`) |
| `LAB_SSH_USER` | compte SSH |
| `LAB_SSH_PASSWORD` | mot de passe |
| `LAB_SSH_KNOWN_HOSTS` | facultatif — sortie de `ssh-keyscan <hôte>`, pour épingler l'empreinte du serveur |

Sans le dernier, le workflow relève l'empreinte du serveur au premier contact et
la croit sur parole. Un secret de dépôt du même nom, s'il en existe un, prime
sur celui de l'organisation.

Pourquoi un mot de passe et pas une clé : chez Infomaniak, l'authentification par
clé n'est pas disponible sur un site Node.js et le port FTP est filtré. Le jour
où la clé sera possible, `sshpass -e` se remplace par une clé déployée.

### 5. Pousser, c'est publier

Le push initial (celui de `gh repo create --push`) déclenche déjà le workflow ;
chaque push suivant sur `main` le relance, et l'onglet Actions permet de le
lancer à la demande. Il :

1. lit le slug dans `package.json` ;
2. `npm ci` puis `npm run build` avec `BASE_PATH=/<slug>/` ;
3. envoie `dist/` par **rsync sur SSH** (mot de passe via `sshpass`) dans
   `lab.agence-absolu.com/lab-projects/<slug>/`, avec `--delete` pour purger
   les bundles de la version précédente — les noms étant empreintés, les
   nouveaux fichiers sont en place avant le retrait des anciens.

Un push plus récent annule le déploiement en cours (`concurrency`). Une fois
le workflow terminé, la démo répond sur `https://lab.agence-absolu.com/<slug>/`
et apparaît en tête de la page d'accueil du lab : le hub liste ce qui est dans
`lab-projects/`, il n'y a rien à lui déclarer.

### Retirer une démo

Le hub n'a pas de commande pour ça : supprimer `lab-projects/<slug>/` sur le
serveur (en SSH) suffit, la page d'accueil s'ajuste à la visite suivante.
Archiver ou supprimer le dépôt GitHub évite qu'un push la republie.
