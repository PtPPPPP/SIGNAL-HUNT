// Forge loads this configuration as CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require('./package.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const electronPackage = require('electron/package.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { existsSync } = require('node:fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('node:path');

const productName = packageJson.productName;
const electronZipDir = resolveElectronZipDir();
const setupExe = `${productName.replace(/\s+/g, '-')}-Setup.exe`;

function resolveElectronZipDir() {
  const explicitDirectory = process.env.ELECTRON_ZIP_DIR?.trim();
  if (explicitDirectory) return explicitDirectory;

  const temporaryDirectory = process.env.TEMP || process.env.TMP;
  if (!temporaryDirectory) return undefined;

  const expectedZip = path.join(
    temporaryDirectory,
    `electron-v${electronPackage.version}-${process.platform}-${process.arch}.zip`,
  );
  return existsSync(expectedZip) ? temporaryDirectory : undefined;
}

module.exports = {
  packagerConfig: {
    appBundleId: 'com.quantumdesign.signalhunt',
    appCopyright: 'Copyright (c) 2026 Quantum Design',
    asar: true,
    ...(electronZipDir ? { electronZipDir } : {}),
    executableName: productName,
    ignore: [
      /^\/\.github($|\/)/,
      /^\/\.vscode($|\/)/,
      /^\/coverage($|\/)/,
      /^\/docs($|\/)/,
      /^\/e2e($|\/)/,
      /^\/electron($|\/)/,
      /^\/node_modules($|\/)/,
      /^\/playwright-report($|\/)/,
      /^\/scripts($|\/)/,
      /^\/src($|\/)/,
      /^\/test-results($|\/)/,
      /^\/.*\.config\.[cm]?[jt]s$/,
      /^\/.*\.test\.[cm]?[jt]sx?$/,
      /^\/tsconfig.*\.json$/,
      /^\/vitest.*\.config\.ts$/,
    ],
    name: productName,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'signal_hunt',
        setupExe,
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};
