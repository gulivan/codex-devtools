import { promises as fs } from 'node:fs';

import type { CodexModelRate, CodexModelRateCard, CodexStatsRatesRefreshResult } from '@main/types';
import { createLogger } from '@shared/utils/logger';

const logger = createLogger('Service:ModelRatesStore');
const RATES_VERSION = 1;

interface RatesFile {
  version: number;
  updatedAt: string | null;
  source: string | null;
  models: CodexModelRate[];
  warnings: string[];
}

const BUNDLED_DEFAULT_RATES: CodexModelRate[] = [
  { model: 'gpt-5.2', inputUsdPer1M: 1.75, cachedInputUsdPer1M: 0.175, outputUsdPer1M: 14, reasoningOutputUsdPer1M: 14 },
  { model: 'gpt-5.1', inputUsdPer1M: 1.25, cachedInputUsdPer1M: 0.125, outputUsdPer1M: 10, reasoningOutputUsdPer1M: 10 },
  { model: 'gpt-5', inputUsdPer1M: 1.25, cachedInputUsdPer1M: 0.125, outputUsdPer1M: 10, reasoningOutputUsdPer1M: 10 },
  { model: 'gpt-5-mini', inputUsdPer1M: 0.25, cachedInputUsdPer1M: 0.025, outputUsdPer1M: 2, reasoningOutputUsdPer1M: 2 },
  { model: 'gpt-5-nano', inputUsdPer1M: 0.05, cachedInputUsdPer1M: 0.005, outputUsdPer1M: 0.4, reasoningOutputUsdPer1M: 0.4 },
  { model: 'gpt-5.2-codex', inputUsdPer1M: 1.75, cachedInputUsdPer1M: 0.175, outputUsdPer1M: 14, reasoningOutputUsdPer1M: 14 },
  { model: 'gpt-5.1-codex-max', inputUsdPer1M: 1.25, cachedInputUsdPer1M: 0.125, outputUsdPer1M: 10, reasoningOutputUsdPer1M: 10 },
  { model: 'gpt-5.1-codex', inputUsdPer1M: 1.25, cachedInputUsdPer1M: 0.125, outputUsdPer1M: 10, reasoningOutputUsdPer1M: 10 },
  { model: 'gpt-5-codex', inputUsdPer1M: 1.25, cachedInputUsdPer1M: 0.125, outputUsdPer1M: 10, reasoningOutputUsdPer1M: 10 },
  { model: 'gpt-5.1-codex-mini', inputUsdPer1M: 0.25, cachedInputUsdPer1M: 0.025, outputUsdPer1M: 2, reasoningOutputUsdPer1M: 2 },
  { model: 'codex-mini-latest', inputUsdPer1M: 1.5, cachedInputUsdPer1M: 0.375, outputUsdPer1M: 6, reasoningOutputUsdPer1M: 6 },
];

const DEFAULT_RATE_CARD: CodexModelRateCard = {
  updatedAt: null,
  source: 'bundled-defaults',
  models: BUNDLED_DEFAULT_RATES,
  warnings: ['Bundled rates may be outdated. Pricing refresh is currently disabled.'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCodexModelRate(value: unknown): value is CodexModelRate {
  return (
    isRecord(value)
    && isString(value.model)
    && isFiniteNumber(value.inputUsdPer1M)
    && isFiniteNumber(value.cachedInputUsdPer1M)
    && isFiniteNumber(value.outputUsdPer1M)
    && isFiniteNumber(value.reasoningOutputUsdPer1M)
  );
}

function isRatesFile(value: unknown): value is RatesFile {
  return (
    isRecord(value)
    && isFiniteNumber(value.version)
    && (value.updatedAt === null || isString(value.updatedAt))
    && (value.source === null || isString(value.source))
    && Array.isArray(value.models)
    && value.models.every(isCodexModelRate)
    && Array.isArray(value.warnings)
    && value.warnings.every(isString)
  );
}

function cloneRateCard(card: CodexModelRateCard): CodexModelRateCard {
  return structuredClone(card);
}

export class ModelRatesStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async getRateCard(): Promise<CodexModelRateCard> {
    const file = await this.readRateFile();
    return {
      updatedAt: file.updatedAt,
      source: file.source,
      models: file.models,
      warnings: file.warnings,
    };
  }

  async refreshFromPricingPage(): Promise<CodexStatsRatesRefreshResult> {
    const current = await this.getRateCard();
    return {
      ...current,
      warnings: [...current.warnings, 'Pricing refresh is disabled in this build.'],
      refreshed: false,
    };
  }

  private async readRateFile(): Promise<RatesFile> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!isRatesFile(parsed) || parsed.version !== RATES_VERSION) {
        return {
          version: RATES_VERSION,
          updatedAt: DEFAULT_RATE_CARD.updatedAt,
          source: DEFAULT_RATE_CARD.source,
          models: cloneRateCard(DEFAULT_RATE_CARD).models,
          warnings: [...DEFAULT_RATE_CARD.warnings],
        };
      }

      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('Failed to load model rates, falling back to bundled defaults', error);
      }

      return {
        version: RATES_VERSION,
        updatedAt: DEFAULT_RATE_CARD.updatedAt,
        source: DEFAULT_RATE_CARD.source,
        models: cloneRateCard(DEFAULT_RATE_CARD).models,
        warnings: [...DEFAULT_RATE_CARD.warnings],
      };
    }
  }
}
