import {spawn} from 'node:child_process';
import {HttpError, insist} from './errors.mjs';

// gh reuses the machine's existing GitHub authentication. No token is ever sent
// to the browser, saved in SQLite, or interpolated into a shell command.
export function githubClient(repository, run = gh) {
  const endpoint = `repos/${repository}`;
  function validate(issue) {
    insist(issue && Number.isSafeInteger(issue.number) && issue.number > 0 && issue.html_url === `https://github.com/${repository}/issues/${issue.number}`, 502, 'GitHub gaf geen geldige Issue-verwijzing terug.');
    return {number: issue.number, url: issue.html_url};
  }
  return {
    async check() {
      const repo = await run('GET', endpoint);
      insist(repo.private === true && repo.has_issues === true, 409, 'Gebruik een private repository met GitHub Issues ingeschakeld.');
    },
    async create(title, body) { return validate(await run('POST', `${endpoint}/issues`, {title, body})); },
    async find(id, createdAt) {
      const marker = `<!-- boer-bart-batch:${id} -->`;
      const since = new Date(Date.parse(createdAt) - 60000).toISOString();
      let found = null;
      for (let page = 1; page <= 1000; page++) {
        const issues = await run('GET', `${endpoint}/issues?state=all&sort=created&direction=asc&since=${encodeURIComponent(since)}&per_page=100&page=${page}`);
        insist(Array.isArray(issues), 502, 'GitHub gaf geen geldig Issue-overzicht terug.');
        for (const issue of issues) if (!issue.pull_request && issue.body?.includes(marker)) {
          insist(!found, 409, 'Er zijn meerdere Issues voor deze verzending. Laat de eigenaar dit eerst oplossen.'); found = validate(issue);
        }
        if (issues.length < 100) return found;
      }
      throw new HttpError(503, 'Het volledige Issue-overzicht kon niet worden gecontroleerd. Er wordt niet opnieuw verstuurd.');
    },
  };
}
export function gh(method, endpoint, payload) {
  return new Promise((resolve, reject) => {
    const args = ['api', '--hostname', 'github.com', '--method', method, endpoint];
    if (payload) args.push('--input', '-');
    const child = spawn('gh', args, {stdio: ['pipe', 'pipe', 'pipe'], env: {...process.env, GH_PROMPT_DISABLED: '1'}});
    let stdout = '', stderr = '', settled = false;
    const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(result); };
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(new HttpError(503, 'GitHub antwoordt niet. Controleer de verzendstatus voordat je opnieuw probeert.')); }, 25000);
    child.on('error', () => finish(new HttpError(503, 'GitHub CLI is niet beschikbaar. Installeer gh en configureer GitHub-toegang op de server.')));
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > 10000000) { child.kill('SIGTERM'); finish(new HttpError(503, 'GitHub-antwoord is te groot om betrouwbaar te controleren.')); }
    });
    child.stderr.on('data', chunk => { if (stderr.length < 10000) stderr += chunk; });
    child.stdin.on('error', () => {});
    child.on('close', code => {
      if (code !== 0) {
        const error = new HttpError(503, 'GitHub-toegang ontbreekt of is geblokkeerd. Controleer gh-authenticatie, repositoryrechten en toegang tot api.github.com.');
        // A confirmed validation/auth rejection did not create an Issue. A lost
        // connection or ambiguous server response must never trigger a second POST.
        error.definitive = /\(HTTP (400|401|403|404|410|422)\)/.test(stderr);
        return finish(error);
      }
      try { finish(null, JSON.parse(stdout)); } catch { finish(new HttpError(502, 'Het antwoord van GitHub kon niet worden bevestigd.')); }
    });
    child.stdin.end(payload ? JSON.stringify(payload) : undefined);
  });
}
