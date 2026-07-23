import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');
const forgeConfig = require('../forge.config.cjs');
const productName = forgeConfig.packagerConfig.name ?? packageJson.productName;
const executableName = forgeConfig.packagerConfig.executableName ?? productName;
const packageDirectory = path.resolve('out', `${productName}-${process.platform}-${process.arch}`);
const makeDirectory = path.resolve('out', 'make');
const setupName = findSetupName(forgeConfig);
const installerPath = path.join(makeDirectory, 'squirrel.windows', process.arch, setupName);
const zipPath = await findFile(makeDirectory, (filePath) => filePath.toLowerCase().endsWith('.zip'));
const files = [
  installerPath,
  zipPath,
  path.join(packageDirectory, `${executableName}.exe`),
  path.join(packageDirectory, 'resources', 'app.asar'),
];

if (files.some((filePath) => !filePath)) {
  throw new Error('Release artifacts are incomplete. Run npm run electron:build first.');
}

for (const filePath of files) {
  const metadata = await stat(filePath);
  if (!metadata.isFile()) throw new Error(`Release artifact is missing: ${filePath}`);
}

const checksumLines = await Promise.all(files.map(async (filePath) => `${await sha256(filePath)}  ${path.relative(makeDirectory, filePath).replaceAll('\\', '/')}`));
const outputPath = path.join(makeDirectory, 'SHA256SUMS.txt');
await writeFile(outputPath, `${checksumLines.join('\n')}\n`, 'utf8');

console.log(`SHA-256 checksums written: ${outputPath}`);

function findSetupName(config) {
  const maker = config.makers.find((candidate) => candidate.name === '@electron-forge/maker-squirrel');
  return maker?.config?.setupExe ?? `${productName.replace(/\s+/g, '-')}-Setup.exe`;
}

async function findFile(root, predicate) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const match = await findFile(entryPath, predicate);
      if (match) return match;
    } else if (predicate(entryPath)) {
      return entryPath;
    }
  }
  return undefined;
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
