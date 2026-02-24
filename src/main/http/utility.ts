import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkForAppUpdate } from '../services/infrastructure/AppUpdateChecker';

import type { CodexAppUpdateStatus } from '@main/types';
import type { FastifyInstance } from 'fastify';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

interface UtilityRouteOptions {
  getVersion?: () => string;
  getAppUpdateStatus?: () => Promise<CodexAppUpdateStatus>;
}

export const registerUtilityRoutes = (app: FastifyInstance, options: UtilityRouteOptions = {}): void => {
  const resolveVersion = (): string => {
    if (options.getVersion) {
      return options.getVersion();
    }

    return readVersionFromPackageJson();
  };

  app.get('/version', async () => {
    return resolveVersion();
  });

  app.get('/app-update', async () => {
    if (options.getAppUpdateStatus) {
      return options.getAppUpdateStatus();
    }

    return checkForAppUpdate({ currentVersion: resolveVersion() });
  });
};
