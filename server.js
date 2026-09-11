// Amorceur du hub — la seule chose qui tienne le port.
//
// Chez Infomaniak, un site Node.js ne se redémarre que depuis le Manager : le
// shell SSH vit dans un conteneur à part, sans vue sur le processus, et aucune
// API publique n'existe pour ça. Plutôt que d'en dépendre, ce fichier ne fait
// qu'ouvrir le port et confier chaque requête à hub.js, qu'il réimporte dès
// qu'une nouvelle version est déposée sur le disque. Déployer le hub revient
// donc à copier hub.js ; ce fichier-ci, lui, n'a plus de raison de changer —
// et s'il change, un redémarrage depuis le Manager reste nécessaire.

import { stat } from 'node:fs/promises';
import http from 'node:http';

const HUB = new URL('./hub.js', import.meta.url);
const PORT = process.env.PORT || 3000;
// Surveillance par sondage plutôt que fs.watch, dont la fiabilité dépend du
// système de fichiers. Un stat toutes les deux secondes ne coûte rien.
const POLL_MS = 2000;

let handle = (req, res) => {
  res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '2' });
  res.end('hub en cours de chargement');
};
// Empreinte de la version chargée : taille et date, ce que rsync met à jour.
let loaded = null;

async function reload() {
  const info = await stat(HUB).catch(() => null);
  if (!info) return;

  const version = `${info.size}-${info.mtimeMs}`;
  if (version === loaded) return;
  loaded = version;

  // La requête d'URL contourne le cache des modules ; l'ancienne version reste
  // en mémoire, ce qui est sans importance à l'échelle de quelques déploiements
  // entre deux redémarrages.
  try {
    const module = await import(`${HUB.href}?v=${encodeURIComponent(version)}`);
    handle = module.default;
    console.log(`hub.js chargé (${version})`);
  } catch (error) {
    // La version en place continue de servir ; le prochain dépôt sera retenté.
    console.error('hub.js illisible, version précédente conservée :', error);
  }
}

await reload();
setInterval(reload, POLL_MS);

http.createServer((req, res) => handle(req, res)).listen(PORT, () => console.log(`hub sur ${PORT}`));
