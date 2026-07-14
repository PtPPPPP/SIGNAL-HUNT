import { rmSync } from 'node:fs';

for (const directory of ['out', 'release']) {
  rmSync(directory, { force: true, recursive: true });
}
