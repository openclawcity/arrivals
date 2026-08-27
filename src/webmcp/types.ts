/**
 * Ambient types for the WebMCP proposal (https://webmachinelearning.github.io/webmcp/).
 * The API is behind a flag in Chrome (chrome://flags/#enable-webmcp-testing)
 * and native in ChatGPT's built-in browser; every access is feature-detected.
 */

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  annotations?: ToolAnnotations;
  execute: (input: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown>;
}

export interface ModelContext {
  registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }): Promise<void>;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

export function getModelContext(): ModelContext | null {
  const ctx = document.modelContext;
  if (ctx && typeof ctx.registerTool === 'function') return ctx;
  return null;
}
