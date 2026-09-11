// Hub du lab — provisoire, sans dépendance à installer.
//
// Les démos vivent toutes dans lab-projects/, à l'écart du code du hub : celui-ci peut
// être redéployé, nettoyé ou reconstruit sans les emporter, et une seule ligne
// suffit à les ignorer côté git. Ce rangement ne se voit pas dans les URL —
// lab-projects/<slug>/ répond sur /<slug>/. Déposer un dossier suffit à publier.
// La racine liste ce qui est en ligne.
//
// Ni npm install, ni build, ni node_modules : la seule bibliothèque, twig.js,
// est embarquée dans vendor/ et les pages sont des vues Twig dans views/. Le
// jour où le vrai hub prendra la place, il reprendra la même convention de
// dossiers.

import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(ROOT, 'views');
// Les fichiers propres au hub (CSS…), servis sous /_hub/ : le souligné n'est
// pas admis dans un slug, aucune démo ne peut donc entrer en collision.
const PUBLIC = path.join(ROOT, 'public');
// Les démos sont publiées ici ; le hub n'y écrit jamais.
const PROJECTS = process.env.LAB_PROJECTS_DIR || path.join(ROOT, 'lab-projects');

// Un slug, puis éventuellement un chemin dans la démo.
const DEMO = /^\/([a-z0-9][a-z0-9-]*)(\/.*)?$/;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

async function statOrNull(file) {
  return stat(file).catch(() => null);
}

// --- Les vues ----------------------------------------------------------------
// twig.js est un build UMD : il se charge en CommonJS. Le cache de require le
// garde d'un rechargement de hub.js à l'autre, ce qui n'a pas d'importance.
const Twig = createRequire(import.meta.url)('./vendor/twig.cjs');

// Les vues sont réenregistrées quand leur fichier change (server.js ne surveille
// que hub.js) : sans ceci, twig.js refuserait de remplacer un id existant.
Twig.cache(false);

// Empreinte (mtime) de chaque vue enregistrée, par nom de fichier.
const loadedViews = new Map();

async function loadViews() {
  const names = (await readdir(VIEWS)).filter((name) => name.endsWith('.twig'));

  for (const name of names) {
    const file = path.join(VIEWS, name);
    const info = await stat(file);
    if (loadedViews.get(name) === info.mtimeMs) continue;

    Twig.twig({
      id: name,
      data: await readFile(file, 'utf8'),
      autoescape: true,
      // Résout {% extends %} et {% include %} parmi les vues enregistrées.
      allowInlineIncludes: true,
    });
    loadedViews.set(name, info.mtimeMs);
  }
}

async function render(res, view, context) {
  await loadViews();
  // render() renvoie un objet String (Twig.Markup), que res.end refuse.
  const html = String(Twig.twig({ ref: view }).render(context));

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(html);
}

// --- La page d'accueil : ce qui est en ligne ---------------------------------
// La date d'un projet est celle de son fichier le plus récent : la date du
// dossier lui-même ne bouge qu'à l'ajout ou au retrait d'une entrée, pas quand
// un fichier est réécrit par un déploiement.
async function lastModified(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => []);
  let latest = 0;

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue;
    const info = await statOrNull(path.join(entry.parentPath, entry.name));
    if (info && info.mtimeMs > latest) latest = info.mtimeMs;
  }

  return latest ? new Date(latest) : null;
}

async function listProjects() {
  // Le dossier peut ne pas exister encore : un lab vide n'est pas une erreur.
  const entries = await readdir(PROJECTS, { withFileTypes: true }).catch(() => []);
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = path.join(PROJECTS, entry.name);
    if (!(await statOrNull(path.join(dir, 'index.html')))) continue;
    projects.push({ slug: entry.name, modified: await lastModified(dir) });
  }

  // Le plus récent en tête ; un projet sans date passe en fin, à égalité par slug.
  return projects.sort(
    (a, b) => (b.modified?.getTime() ?? 0) - (a.modified?.getTime() ?? 0) || a.slug.localeCompare(b.slug),
  );
}

// La date est formatée ici, en heure de Paris, quel que soit le fuseau du
// serveur : twig.js n'a pas de fuseau à proposer à son filtre date.
const formatDate = (date) => ({
  iso: date.toISOString().slice(0, 10),
  label: date.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }),
});

async function home(res) {
  const projects = (await listProjects()).map(({ slug, modified }) => ({
    slug,
    modified: modified && formatDate(modified),
  }));

  await render(res, 'home.twig', { projects });
}

// --- Les démos ---------------------------------------------------------------
async function serveProject(req, res, pathname) {
  const match = DEMO.exec(pathname);
  if (!match) return false;

  // Ni fichier ni dossier caché : un .git ou un .env égaré reste invisible.
  if (pathname.split('/').some((segment) => segment.startsWith('.'))) return false;

  // Le chemin est reconstruit depuis lab-projects/ puis vérifié : même encodé, un
  // « .. » ne peut pas désigner un fichier hors des démos — le code du hub,
  // juste au-dessus, reste hors d'atteinte.
  let file = path.resolve(PROJECTS, `.${pathname}`);
  if (!file.startsWith(PROJECTS + path.sep)) return false;

  let info = await statOrNull(file);

  if (info?.isDirectory()) {
    file = path.join(file, 'index.html');
    info = await statOrNull(file);
  }

  if (!info) {
    // Un chemin porteur d'une extension désigne un fichier : absent, il est
    // absent. Lui renvoyer index.html donnerait du HTML là où le navigateur
    // attend un script — une erreur de type MIME pénible à diagnostiquer.
    if (path.extname(pathname)) return false;

    // Sinon c'est une route interne à la démo : son index.html répond.
    file = path.join(PROJECTS, match[1], 'index.html');
    info = await statOrNull(file);
    if (!info) return false;
  }

  // Les fichiers de assets/ portent une empreinte dans leur nom et peuvent
  // être figés ; index.html nomme les bundles de la version courante, il doit
  // donc être revalidé à chaque visite.
  sendFile(req, res, file, info, !file.endsWith('.html'));
  return true;
}

// --- Les fichiers du hub -----------------------------------------------------
async function servePublic(req, res, pathname) {
  if (!pathname.startsWith('/_hub/')) return false;
  if (pathname.split('/').some((segment) => segment.startsWith('.'))) return false;

  const file = path.resolve(PUBLIC, `.${pathname.slice('/_hub'.length)}`);
  if (!file.startsWith(PUBLIC + path.sep)) return false;

  const info = await statOrNull(file);
  if (!info?.isFile()) return false;

  // Pas d'empreinte dans les noms : revalidé à chaque visite, l'ETag fait le reste.
  sendFile(req, res, file, info, false);
  return true;
}

// Envoie un fichier avec ETag ; `immutable` le fige un an dans les caches.
function sendFile(req, res, file, info, immutable) {
  const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304).end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Content-Length': info.size,
    ETag: etag,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache, must-revalidate',
  });

  if (req.method === 'HEAD') return void res.end();
  createReadStream(file).pipe(res);
}

// Point d'entrée, appelé par server.js pour chaque requête. Ce module est
// rechargé à chaud dès qu'il change sur le disque : il ne doit rien tenir
// d'ouvert (port, timer) qui survivrait à son remplacement.
export default async function handle(req, res) {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://lab').pathname);

    if (pathname === '/') return void (await home(res));
    if (await servePublic(req, res, pathname)) return;
    if (await serveProject(req, res, pathname)) return;

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('500');
  }
}
