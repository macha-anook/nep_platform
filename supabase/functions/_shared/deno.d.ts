// Minimal Deno ambient types for VS Code TypeScript LSP.
// The real types are injected by the Deno runtime at deploy time.
declare namespace Deno {
  interface Env {
    get(key: string): string | undefined;
  }
  const env: Env;
  function serve(
    handler: (req: Request) => Response | Promise<Response>,
    options?: {
      port?: number;
      hostname?: string;
      onError?: (error: unknown) => Response | Promise<Response>;
    }
  ): void;
}
