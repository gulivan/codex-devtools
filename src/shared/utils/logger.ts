import type { Logger } from '@shared/types';

export const createLogger = (scope: string): Logger => {
  const prefix = `[${scope}]`;

  return {
    info: (message, ...args) => console.info(prefix, message, ...args),
    warn: (message, ...args) => console.warn(prefix, message, ...args),
    error: (message, ...args) => console.error(prefix, message, ...args),
    debug: (message, ...args) => console.debug(prefix, message, ...args)
  };
};
