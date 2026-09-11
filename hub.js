// Hub du lab — provisoire, sans dépendance.
//
// Les démos vivent toutes dans lab-projects/, à l'écart du code du hub : celui-ci peut
// être redéployé, nettoyé ou reconstruit sans les emporter, et une seule ligne
// suffit à les ignorer côté git. Ce rangement ne se voit pas dans les URL —
// lab-projects/<slug>/ répond sur /<slug>/. Déposer un dossier suffit à publier.
// La racine liste ce qui est en ligne.
//
// Aucune dépendance : ni npm install, ni build, ni node_modules. Le jour où le
// vrai hub prendra la place, il reprendra la même convention de dossiers.

import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
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

// --- La page d'accueil : ce qui est en ligne ---------------------------------
async function listProjects() {
  // Le dossier peut ne pas exister encore : un lab vide n'est pas une erreur.
  const entries = await readdir(PROJECTS, { withFileTypes: true }).catch(() => []);
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    if (await statOrNull(path.join(PROJECTS, entry.name, 'index.html'))) projects.push(entry.name);
  }

  return projects.sort();
}

async function home(res) {
  const projects = await listProjects();
  const items = projects.length
    ? projects.map((d) => `<li><a href="/${d}/">${d}</a></li>`).join('')
    : '<li>Aucune démo publiée pour l’instant.</li>';

  const page = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lab — Agence Absolu</title>
<style>
  body{font:16px/1.6 system-ui,sans-serif;margin:0;padding:3rem 1.5rem;color:#111}
  main{max-width:34rem;margin:0 auto}
  h1{font-size:1.5rem;margin:0 0 .5rem}
  p{color:#666;margin:0 0 2rem}
  ul{list-style:none;padding:0;margin:0}
  li{border-top:1px solid #e5e5e5;padding:.85rem 0}
  a{color:#111;text-decoration:none}
  a:hover{text-decoration:underline}
  @media (prefers-color-scheme:dark){
    body{background:#111;color:#f5f5f5}a{color:#f5f5f5}
    p{color:#999}li{border-color:#2a2a2a}
  }
</style></head>
<body><main><h1>Lab</h1><p>Démonstrations techniques.</p><ul>${items}</ul></main></body></html>`;

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(page);
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

  const isHtml = file.endsWith('.html');
  const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304).end();
    return true;
  }

  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Content-Length': info.size,
    ETag: etag,
    // Les fichiers de assets/ portent une empreinte dans leur nom et peuvent
    // être figés ; index.html nomme les bundles de la version courante, il doit
    // donc être revalidé à chaque visite.
    'Cache-Control': isHtml ? 'no-cache, must-revalidate' : 'public, max-age=31536000, immutable',
  });

  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  createReadStream(file).pipe(res);
  return true;
}

// Point d'entrée, appelé par server.js pour chaque requête. Ce module est
// rechargé à chaud dès qu'il change sur le disque : il ne doit rien tenir
// d'ouvert (port, timer) qui survivrait à son remplacement.
export default async function handle(req, res) {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://lab').pathname);

    if (pathname === '/') return void (await home(res));
    if (await serveProject(req, res, pathname)) return;

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('500');
  }
}
