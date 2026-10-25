// Developer-only read path. Never import this script into the application.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const projectId = '7444919587454097178';
async function apiKey() {
  if (process.env.STITCH_API_KEY) return process.env.STITCH_API_KEY;
  const configPath = path.join(
    process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
    'config.toml',
  );
  const config = await fs.readFile(configPath, 'utf8');
  const section = config
    .split(/(?=^\[)/m)
    .find((value) => /^\[mcp_servers\.stitch\]/.test(value));
  if (
    !section ||
    section.match(/^url\s*=\s*"([^"]+)"/m)?.[1] !==
      'https://stitch.googleapis.com/mcp'
  )
    throw new Error();
  const environmentBlock = section.match(
    /^env_http_headers\s*=\s*\{([^\r\n]+)\}/m,
  )?.[1];
  const environmentName =
    environmentBlock?.match(/"?X-Goog-Api-Key"?\s*=\s*"([^"]+)"/)?.[1] ||
    config.match(
      /\[mcp_servers\.stitch\.env_http_headers\]\s*\r?\n(?:[^\[]*?)"?X-Goog-Api-Key"?\s*=\s*"([^"]+)"/,
    )?.[1];
  if (environmentName) {
    if (!process.env[environmentName]) throw new Error();
    return process.env[environmentName];
  }
  const existing =
    section.match(/"?X-Goog-Api-Key"?\s*=\s*"([^"\r\n]+)"/)?.[1] ||
    config.match(
      /\[mcp_servers\.stitch\.http_headers\]\s*\r?\n(?:[^\[]*?)"?X-Goog-Api-Key"?\s*=\s*"([^"\r\n]+)"/,
    )?.[1];
  if (!existing) throw new Error();
  return existing;
}
async function call(key, name, args) {
  const response = await fetch('https://stitch.googleapis.com/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'X-Goog-Api-Key': key,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  const payload = JSON.parse(
    raw.startsWith('data:')
      ? raw
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .at(-1)
          .slice(5)
      : raw,
  );
  if (!response.ok || payload.error || payload.result?.isError)
    throw new Error();
  const result = payload.result;
  return (
    result.structuredContent ??
    JSON.parse(result.content.find((item) => item.type === 'text').text)
  );
}
async function download(url, target) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    ![
      'lh3.googleusercontent.com',
      'contribution.usercontent.google.com',
    ].includes(parsed.hostname)
  )
    throw new Error();
  const response = await fetch(parsed, {
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error();
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
}
try {
  const key = await apiKey();
  const result = await call(key, 'list_screens', { projectId });
  const screens = result.screens ?? [];
  console.info(
    `Stitch connection verified. Project ${projectId}: ${screens.length} screens available.`,
  );
  if (process.argv.includes('--export')) {
    const root = path.join(process.cwd(), 'docs/designs/wedding-workspace');
    await fs.mkdir(root, { recursive: true });
    const references = [];
    for (const screen of screens.filter((item) =>
      /Welcome & Start|Wedding Details Setup|Newly Created Empty|Populated Active/.test(
        item.title ?? '',
      ),
    )) {
      const data = await call(key, 'get_screen', { name: screen.name });
      const id = screen.name.split('/').at(-1);
      if (!/^[a-f0-9]{32}$/.test(id)) throw new Error();
      await download(data.screenshot.downloadUrl, path.join(root, id + '.png'));
      await download(data.htmlCode.downloadUrl, path.join(root, id + '.html'));
      references.push({
        name: screen.name,
        title: screen.title,
        deviceType: screen.deviceType,
        screenshot: id + '.png',
        html: id + '.html',
      });
    }
    await fs.writeFile(
      path.join(root, 'references.json'),
      JSON.stringify({ projectId, references }, null, 2) + '\n',
    );
    console.info(
      `Exported ${references.length} design references. No credentials or MCP download URLs saved in the reference manifest.`,
    );
  }
} catch {
  console.error(
    'Stitch access failed. Check the local key/configuration and network access. Credentials and provider responses withheld. Existing design references are unchanged unless an export was requested.',
  );
  process.exitCode = 1;
}
