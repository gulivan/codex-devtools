import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface CodexDevToolsConfig {
  general: {
    launchAtLogin: boolean;
    showDockIcon: boolean;
    codexSessionsPath?: string;
  };
  display: {
    showReasoning: boolean;
    showTokenCounts: boolean;
    showDeveloperMessages: boolean;
    showAttachmentPreviews: boolean;
    theme: 'system' | 'dark' | 'light';
  };
  httpServer?: {
    enabled: boolean;
    port?: number;
  };
}

const DEFAULT_CONFIG: CodexDevToolsConfig = {
  general: {
    launchAtLogin: false,
    showDockIcon: true,
  },
  display: {
    showReasoning: true,
    showTokenCounts: true,
    showDeveloperMessages: false,
    showAttachmentPreviews: true,
    theme: 'dark',
  },
  httpServer: {
    enabled: false,
    port: 3456,
  },
};

function deepMerge<T>(target: T, source: Partial<T>): T {
  const output = { ...target } as Record<string, unknown>;

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }

    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof output[key] === 'object' &&
      output[key] !== null &&
      !Array.isArray(output[key])
    ) {
      output[key] = deepMerge(output[key] as Record<string, unknown>, value as Record<string, unknown>);
      continue;
    }

    output[key] = value;
  }

  return output as T;
}

export class ConfigManager {
  private readonly configPath: string;
  private config: CodexDevToolsConfig;

  constructor(configPath: string = path.join(os.homedir(), '.config', 'codex-devtools', 'config.json')) {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }

  getConfig(): CodexDevToolsConfig {
    return structuredClone(this.config);
  }

  updateConfig(partial: Partial<CodexDevToolsConfig>): CodexDevToolsConfig {
    this.config = deepMerge(this.config, partial);
    this.saveConfig();
    return this.getConfig();
  }

  updateSection<K extends keyof CodexDevToolsConfig>(
    section: K,
    partial: Partial<CodexDevToolsConfig[K]>,
  ): CodexDevToolsConfig {
    const currentSection = this.config[section] ?? {};
    this.config = {
      ...this.config,
      [section]: deepMerge(currentSection, partial),
    };
    this.saveConfig();
    return this.getConfig();
  }

  resetConfig(): CodexDevToolsConfig {
    this.config = structuredClone(DEFAULT_CONFIG);
    this.saveConfig();
    return this.getConfig();
  }

  private loadConfig(): CodexDevToolsConfig {
    if (!fs.existsSync(this.configPath)) {
      const initial = structuredClone(DEFAULT_CONFIG);
      this.writeConfig(initial);
      return initial;
    }

    try {
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<CodexDevToolsConfig>;
      return deepMerge(structuredClone(DEFAULT_CONFIG), parsed);
    } catch {
      const fallback = structuredClone(DEFAULT_CONFIG);
      this.writeConfig(fallback);
      return fallback;
    }
  }

  private saveConfig(): void {
    this.writeConfig(this.config);
  }

  private writeConfig(config: CodexDevToolsConfig): void {
    const dir = path.dirname(this.configPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
  }
}
