import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const forgeConfig = require('../forge.config.cjs');
const target = process.argv[2];

if (target !== 'package' && target !== 'make') {
  throw new Error('Usage: node scripts/verify-electron-artifacts.mjs <package|make>');
}

const platform = process.platform;
const arch = process.arch;
const productName = packageJson.productName;
const executableName = forgeConfig.packagerConfig.executableName ?? productName;
const packageDirectory = path.join('out', `${forgeConfig.packagerConfig.name ?? productName}-${platform}-${arch}`);
const executablePath = path.join(packageDirectory, `${executableName}.exe`);
const appAsarPath = path.join(packageDirectory, 'resources', 'app.asar');

const errors = [];
verifyDirectory(packageDirectory, 'unpacked application directory', errors);
verifyFile(executablePath, 5 * 1024 * 1024, 'main executable', errors);
verifyFile(appAsarPath, 1024, 'application archive', errors);

let installerPath;
let zipPath;

if (target === 'make') {
  const makeDirectory = path.join('out', 'make');
  const setupExe = findSquirrelSetupName(forgeConfig);
  installerPath = path.join(makeDirectory, 'squirrel.windows', arch, setupExe);
  zipPath = findArtifact(makeDirectory, (filePath) => filePath.toLowerCase().endsWith('.zip'));

  verifyFile(installerPath, 1024 * 1024, 'Windows installer', errors);
  if (!zipPath) {
    errors.push(`distributable ZIP: no .zip file found under ${path.resolve(makeDirectory)}`);
  } else {
    verifyFile(zipPath, 1024 * 1024, 'distributable ZIP', errors);
  }
}

if (errors.length > 0) {
  const discovered = listOutputEntries('out');
  throw new Error(
    [
      `Electron ${target} artifact verification failed.`,
      `productName=${productName} platform=${platform} arch=${arch}`,
      ...errors.map((error) => `- ${error}`),
      `Discovered output entries:\n${discovered.length > 0 ? discovered.join('\n') : '(out directory is missing or empty)'}`,
    ].join('\n'),
  );
}

console.log(`Electron ${target} artifacts verified.`);
console.log(`Unpacked app: ${path.resolve(packageDirectory)}`);
console.log(`Executable: ${describeFile(executablePath)}`);
console.log(`Application archive: ${describeFile(appAsarPath)}`);
if (installerPath) console.log(`Installer: ${describeFile(installerPath)}`);
if (zipPath) console.log(`ZIP: ${describeFile(zipPath)}`);

function verifyDirectory(directoryPath, label, errors) {
  if (!existsSync(directoryPath) || !statSync(directoryPath).isDirectory()) {
    errors.push(`${label}: missing ${path.resolve(directoryPath)}`);
  }
}

function verifyFile(filePath, minimumSize, label, errors) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    errors.push(`${label}: missing ${path.resolve(filePath)}`);
    return;
  }

  const size = statSync(filePath).size;
  if (size < minimumSize) {
    errors.push(`${label}: ${path.resolve(filePath)} is ${size} bytes; expected at least ${minimumSize} bytes`);
  }
}

function findSquirrelSetupName(config) {
  const maker = config.makers.find((candidate) => candidate.name === '@electron-forge/maker-squirrel');
  return maker?.config?.setupExe ?? `${productName.replace(/\s+/g, '-')}-Setup.exe`;
}

function findArtifact(root, predicate) {
  if (!existsSync(root)) return undefined;

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = findArtifact(entryPath, predicate);
      if (nested) return nested;
    } else if (predicate(entryPath)) {
      return entryPath;
    }
  }

  return undefined;
}

function listOutputEntries(root) {
  if (!existsSync(root)) return [];
  const entries = [];

  const visit = (directory, depth) => {
    if (depth > 4) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      entries.push(path.resolve(entryPath));
      if (entry.isDirectory()) visit(entryPath, depth + 1);
    }
  };

  visit(root, 0);
  return entries.slice(0, 80);
}

function describeFile(filePath) {
  const size = statSync(filePath).size;
  return `${path.resolve(filePath)} (${formatBytes(size)})`;
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}
