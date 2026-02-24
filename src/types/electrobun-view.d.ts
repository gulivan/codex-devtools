declare module 'electrobun/view' {
  type AnyRequests = Record<string, { params: unknown; response: unknown }>;
  type AnyMessages = Record<string, unknown>;

  interface ElectrobunRPCSchema {
    bun: { requests: AnyRequests; messages: AnyMessages };
    webview: { requests: AnyRequests; messages: AnyMessages };
  }

  type RPCInstance<Schema extends ElectrobunRPCSchema> = {
    request: {
      [K in keyof Schema['bun']['requests']]: (
        params: Schema['bun']['requests'][K]['params'],
      ) => Promise<Schema['bun']['requests'][K]['response']>;
    };
    send: {
      [K in keyof Schema['bun']['messages']]: (
        payload: Schema['bun']['messages'][K],
      ) => void;
    };
    addMessageListener: (
      message: keyof Schema['webview']['messages'] | '*',
      listener: (...args: unknown[]) => void,
    ) => void;
    removeMessageListener: (
      message: keyof Schema['webview']['messages'] | '*',
      listener: (...args: unknown[]) => void,
    ) => void;
  };

  export class Electroview<Schema extends ElectrobunRPCSchema = ElectrobunRPCSchema> {
    constructor(config: {
      rpc: RPCInstance<Schema>;
    });

    static defineRPC<Schema extends ElectrobunRPCSchema>(config: {
      handlers: {
        requests?: Record<string, (params: unknown) => unknown>;
        messages?: Record<string, (payload: unknown) => void>;
      };
      maxRequestTime?: number;
    }): RPCInstance<Schema>;
  }
}
