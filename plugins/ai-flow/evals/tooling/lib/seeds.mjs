// Seed embedding for case (e) (design D6): the per-case agent mock _server.md carries seeds/explore.md
// verbatim between marker lines, because the agent-mock body is instructions, not a substitutable template.
import fs from 'node:fs';
import path from 'node:path';

export const SEED_BEGIN = '<!-- SEED:explore BEGIN -->\n';
export const SEED_END = '<!-- SEED:explore END -->';

/** Text between the seed markers, or null when the markers are absent. */
export function extractSeed(serverText) {
  const i = serverText.indexOf(SEED_BEGIN);
  const j = serverText.indexOf(SEED_END);
  if (i < 0 || j < i) return null;
  return serverText.slice(i + SEED_BEGIN.length, j);
}

/** [] when <caseDir>/mocks/plugin_engram_engram/_server.md embeds <caseDir>/seeds/explore.md verbatim. */
export function checkSeedSync(caseDir) {
  const server = fs.readFileSync(path.join(caseDir, 'mocks', 'plugin_engram_engram', '_server.md'), 'utf8');
  const seed = fs.readFileSync(path.join(caseDir, 'seeds', 'explore.md'), 'utf8');
  const embedded = extractSeed(server);
  if (embedded === null) return ['_server.md has no SEED:explore markers'];
  return embedded === seed ? [] : ['seeds/explore.md and the copy embedded in mocks/plugin_engram_engram/_server.md differ; edit both'];
}
