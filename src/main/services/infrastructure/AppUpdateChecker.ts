import { createLogger } from '@shared/utils/logger';

import type { CodexAppUpdateStatus } from '@main/types';

const logger = createLogger('Main:app-update');
const DEFAULT_RELEASE_ENDPOINT = 'https://api.github.com/repos/gulivan/codex-devtools/releases/latest';

interface CheckForAppUpdateOptions {
  currentVersion: string;
  fetchImpl?: typeof fetch;
  releaseEndpoint?: string;
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<number | string>;
}

function normalizeVersion(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('v') || trimmed.startsWith('V')) {
    return trimmed.slice(1);
  }

  return trimmed;
}

function parseSemver(value: string): ParsedSemver | null {
  const match = normalizeVersion(value).match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  );
  if (!match) {
    return null;
  }

  const prerelease = match[4]
    ? match[4]
      .split('.')
      .filter((token) => token.length > 0)
      .map((token) => (/^\d+$/.test(token) ? Number.parseInt(token, 10) : token))
    : [];

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease,
  };
}

function comparePrereleaseIdentifier(left: number | string, right: number | string): number {
  const leftIsNumber = typeof left === 'number';
  const rightIsNumber = typeof right === 'number';

  if (leftIsNumber && rightIsNumber) {
    return left - right;
  }

  if (leftIsNumber && !rightIsNumber) {
    return -1;
  }

  if (!leftIsNumber && rightIsNumber) {
    return 1;
  }

  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function compareSemver(left: ParsedSemver, right: ParsedSemver): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }

  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }

  if (left.patch !== right.patch) {
    return left.patch - right.patch;
  }

  if (left.prerelease.length === 0 && right.prerelease.length === 0) {
    return 0;
  }

  if (left.prerelease.length === 0) {
    return 1;
  }

  if (right.prerelease.length === 0) {
    return -1;
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];

    if (leftIdentifier === undefined) {
      return -1;
    }

    if (rightIdentifier === undefined) {
      return 1;
    }

    const comparison = comparePrereleaseIdentifier(leftIdentifier, rightIdentifier);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

function createBaseStatus(currentVersion: string): CodexAppUpdateStatus {
  return {
    currentVersion,
    latestVersion: null,
    updateAvailable: false,
    releaseUrl: null,
    checkedAt: new Date().toISOString(),
    source: 'github',
    error: null,
  };
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Failed to check for updates.';
}

export async function checkForAppUpdate(options: CheckForAppUpdateOptions): Promise<CodexAppUpdateStatus> {
  const currentVersion = normalizeVersion(options.currentVersion || '0.0.0') || '0.0.0';
  const status = createBaseStatus(currentVersion);
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(options.releaseEndpoint ?? DEFAULT_RELEASE_ENDPOINT, {
      headers: {
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      status.error = `Update check failed with HTTP ${response.status}.`;
      return status;
    }

    const payload = (await response.json()) as {
      tag_name?: unknown;
      html_url?: unknown;
    };

    const tagName = typeof payload.tag_name === 'string' ? payload.tag_name : '';
    const latestVersion = normalizeVersion(tagName);
    status.latestVersion = latestVersion || null;
    status.releaseUrl = typeof payload.html_url === 'string' ? payload.html_url : null;

    if (!latestVersion) {
      status.error = 'Latest release metadata is missing a version.';
      return status;
    }

    const currentSemver = parseSemver(currentVersion);
    const latestSemver = parseSemver(latestVersion);
    if (!currentSemver || !latestSemver) {
      status.error = `Cannot compare versions (${currentVersion} vs ${latestVersion}).`;
      return status;
    }

    status.updateAvailable = compareSemver(latestSemver, currentSemver) > 0;
    return status;
  } catch (error) {
    const message = asErrorMessage(error);
    logger.error('Update check failed', error);
    status.error = message;
    return status;
  }
}
