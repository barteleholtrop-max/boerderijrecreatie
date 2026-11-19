import fs from 'node:fs';
import path from 'node:path';

// Next standalone changes process.cwd() to .next/standalone. Locate the existing
// checkout instead of accidentally creating a second proposal database there.
export function proposalPaths(cwd, environment = process.env) {
  let repo = null;
  for (let folder = path.resolve(cwd);;) {
    if (fs.existsSync(path.join(folder, 'tools/website-dev/store.mjs')) && fs.existsSync(path.join(folder, 'apps/backoffice/package.json'))) { repo = folder; break; }
    const parent = path.dirname(folder); if (parent === folder) break; folder = parent;
  }
  const sourceAssets = repo && path.join(repo, 'tools/website-dev');
  const assetsDir = environment.PROPOSALS_ASSETS_DIR || sourceAssets || path.join(cwd, 'proposal-assets');
  return {
    dataDir: path.resolve(environment.PROPOSALS_DATA_DIR || (repo ? path.join(repo, 'var/website-dev') : path.join(environment.APP_DATA_DIR || path.join(cwd, 'var'), 'proposals'))),
    assetsDir,
    boardDatabase: environment.WEBSITE_BOARD_DATABASE || (repo ? path.join(repo, 'apps/planbord/var/database.sqlite') : undefined),
    // Planbord (optioneel): zonder planbord zijn er geen onderwerpen om aan te koppelen; voorstellen werken gewoon.
    boardSnapshot: environment.PROPOSALS_BOARD_SNAPSHOT || (repo ? path.join(repo, 'apps/planbord/snapshot/board.json') : path.join(assetsDir, 'board.json')),
  };
}
