import * as fs from 'node:fs';
import * as path from 'node:path';

import type { FastifyInstance } from 'fastify';

export const readVersionFromPackageJson = (): string => {
  const candidatePaths = [
    path.resolve(__dirname, '../../package.json'),
    path.resolve(__dirname, '../../../package.json'),
    path.resolve(process.cwd(), 'package.json'),
  ];

  try {
    for (const candidate of candidatePaths) {
      if (!fs.existsSync(candidate)) {
        continue;
      }

      const packageJson = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { version?: string };
      if (packageJson.version) {
        return packageJson.version;
      }
    }
  } catch {
    // Fall through to default.
  }

  return '0.0.0';
};

export const registerUtilityRoutes = (
  app: FastifyInstance,
  getVersion: (() => string) | undefined,
): void => {
  app.get('/version', async () => {
    if (getVersion) {
      return getVersion();
    }

    return readVersionFromPackageJson();
  });
};
