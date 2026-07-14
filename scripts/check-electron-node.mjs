const [major, minor] = process.versions.node.split('.').map(Number);

const isSupported = major === 22 || (major === 24 && minor < 16);

if (!isSupported) {
  throw new Error(
    [
      `Electron packaging requires Node 22 LTS or Node 24.0-24.15; current runtime is ${process.version}.`,
      'Electron Forge 7.11.2 can exit during Finalizing without producing out/ on Node 24.16+ and Node 26.',
      'Use the version pinned in .nvmrc before running an Electron packaging command.',
    ].join('\n'),
  );
}

console.log(`Electron packaging runtime verified: ${process.version}`);
