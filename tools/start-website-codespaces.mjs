import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const name = process.env.CODESPACE_NAME;
const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
if (!name || !domain || !/^[a-z0-9-]+$/.test(name) || !/^[a-z0-9.-]+$/.test(domain)) {
  throw new Error('Start dit commando in een GitHub Codespace. Gebruik lokaal npm run dev:website.');
}
const child = spawn(process.execPath, [fileURLToPath(new URL('./serve-website.mjs', import.meta.url))], {
  stdio: 'inherit', env: {...process.env, WEBSITE_HOST: '0.0.0.0', WEBSITE_PORT: '3002', WEBSITE_ORIGIN: `https://${name}-3002.${domain}`},
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
