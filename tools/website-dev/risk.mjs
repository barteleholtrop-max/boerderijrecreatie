// Risk classification for incoming changes (docs/GOEDKEURINGSBELEID.md).
// Low-risk changes may be fast-forwarded automatically in the local development
// environment; everything else needs explicit owner approval. Unknown paths are
// never low risk: a file must match the allowlist below to count as 'laag'.
export const CATEGORIES = {
  beveiliging: 'Beveiliging',
  betalingen: 'Betalingen',
  gegevens: 'Databasegegevens',
  bedrijfsregels: 'Bedrijfsregels',
  architectuur: 'Architectuur',
  productie: 'Productie',
  bron: 'Bedrijfsgegevens buiten de centrale backoffice',
  verwijdering: 'Verwijderde of hernoemde code',
  onbekend: 'Onbekend gebied',
};

// Checked in order; every match is reported. Patterns run against repository paths.
const RULES = [
  ['productie', /^deploy\/|^hosting\/|^\.github\/|(^|\/)Dockerfile|\.Dockerfile$|^\.dockerignore$|cloud-?run/i],
  ['beveiliging', /(^|\/)\.env(\.|$)|(^|\/)(auth|middleware|csrf|session|login|security|secrets?|permissions?)[^/]*$|(^|\/)app\/api\/|^tools\/setup\.mjs$|^tools\/private-data-path\.mjs$|sheet-policy|owner-api|github\.mjs$|daily-merge|dispatch\.mjs$/i],
  ['betalingen', /kassa|betaal|payment|checkout|factu|invoice|(^|\/|-)orders?([-./]|$)|bestel/i],
  ['gegevens', /(^|\/)(db|drizzle|migrations?|snapshot|var)\/|\.(sql|sqlite)$|^data\/|^originals\/|^integrations\/|(^|[/-])store\.(m?js|ts)$|-store\.(m?js|ts)$/i],
  ['bedrijfsregels', /-core\.(m?js|ts)$|prijs|price|pricing|btw|recept|voorraad|stock|reserv|opening|capaciteit|administrat|inkoop|allergen/i],
  ['architectuur', /(^|\/)package(-lock)?\.json$|(^|\/)tsconfig[^/]*\.json$|(^|\/)next\.config\.|(^|\/)eslint|^\.nvmrc$|^\.gitignore$|^boerbart-test$|^tools\/|(^|\/)lib\/portable\/|^(AGENTS|CLAUDE)\.md$|^docs\/(GOEDKEURINGSBELEID|ARCHITECTUUR-|PLANBORD-ALS-CENTRALE-BRON|BOUWAFSPRAAK)/i],
];

// Low risk only when nothing above matched and the path is in this allowlist.
const LOW = [
  /^docs\/.+\.(md|png|jpe?g|svg|webp)$/i, /^README\.md$/i,
  /^tests\//,
  /^apps\/website\/.+\.(html|css|js|svg|png|jpe?g|webp|avif|gif|ico|woff2?|txt|json)$/i,
  /^apps\/(backoffice|planbord)\/(app|components)\/.+\.(tsx|jsx|css)$/i,
  /^apps\/(backoffice|planbord)\/public\//,
];

// Added lines in user-facing code that look like hardcoded prices or opening times.
const SOURCE_CHECKED = /^apps\/(website|backoffice\/app|backoffice\/components|planbord\/app)\//;
const HARDCODED = [
  [/€\s?\d|\d\s?€|\bEUR\s?\d/i, 'een bedrag'],
  [/\b([01]?\d|2[0-3])[:.][0-5]\d\s*(-|–|tot)\s*([01]?\d|2[0-3])[:.][0-5]\d\b/, 'een tijdvak (openingstijden?)'],
];

/**
 * @param {{status: string, file: string, from?: string}[]} changes  git diff --name-status entries (A/M/D/R…)
 * @param {Record<string, string[]>} added  added lines per file (optional)
 */
export function classify(changes, added = {}) {
  const found = new Map();
  const note = (category, file, detail) => {
    if (!found.has(category)) found.set(category, []);
    found.get(category).push(detail ? `${file} (${detail})` : file);
  };
  for (const {status, file, from} of changes) {
    const paths = from ? [from, file] : [file];
    let matched = false;
    for (const [category, pattern] of RULES) if (paths.some(p => pattern.test(p))) { note(category, file); matched = true; }
    if (/^[DR]/.test(status) && !/^(docs\/|README\.md$)/.test(file)) { note('verwijdering', file); matched = true; }
    if (!matched && !paths.every(p => LOW.some(pattern => pattern.test(p)))) note('onbekend', file);
    if (SOURCE_CHECKED.test(file)) {
      for (const line of added[file] || []) {
        const hit = HARDCODED.find(([pattern]) => pattern.test(line));
        if (hit) { note('bron', file, `bevat ${hit[1]}: “${line.trim().slice(0, 80)}”`); break; }
      }
    }
  }
  const reasons = [...found].map(([category, files]) => ({category, label: CATEGORIES[category], files: [...new Set(files)]}));
  return {level: reasons.length ? 'goedkeuring' : 'laag', reasons, files: changes.length};
}

// Parse `git diff --name-status -z` output.
export function parseNameStatus(raw) {
  const parts = raw.split('\0').filter(Boolean), changes = [];
  for (let i = 0; i < parts.length; i++) {
    const status = parts[i];
    if (/^[RC]/.test(status)) { changes.push({status, from: parts[i + 1], file: parts[i + 2]}); i += 2; }
    else { changes.push({status, file: parts[i + 1]}); i += 1; }
  }
  return changes;
}

// Parse added lines per file from `git diff --unified=0 --no-color` output.
export function parseAddedLines(diff) {
  const added = {};
  let file = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) { file = line.startsWith('+++ b/') ? line.slice(6) : null; continue; }
    if (file && line.startsWith('+') && !line.startsWith('+++')) (added[file] ||= []).push(line.slice(1));
  }
  return added;
}

// Classify base..head using a git runner ({code, stdout} results), as used by version.mjs.
export async function classifyRange(run, base, head) {
  const names = await run(['diff', '--name-status', '-z', '--find-renames', base, head]);
  if (names.code !== 0) return {level: 'goedkeuring', reasons: [{category: 'onbekend', label: CATEGORIES.onbekend, files: ['De wijzigingen konden niet worden gelezen.']}], files: 0};
  const changes = parseNameStatus(names.stdout);
  const diff = await run(['diff', '--unified=0', '--no-color', '--no-ext-diff', base, head, '--', 'apps']);
  return classify(changes, diff.code === 0 ? parseAddedLines(diff.stdout) : {});
}

