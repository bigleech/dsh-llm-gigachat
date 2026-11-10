/**
 * dsh-llm-gigachat -- DeepSeek Harness plugin type definitions.
 */

import type { z } from '@deepseek-ai/schemastery';

export const name: string;
export const inject: string[];

export interface ModelConfig {
  id: string;
  name?: string | null;
}

export interface TlsConfig {
  rejectUnauthorized: boolean;
}

export const Config: z<any>;
export const SettingsSchema: z<any>;

export function apply(ctx: PluginContext, config: Record<string, unknown>): void;

export interface PluginContext {
  logger?: Console;
  inject(deps: string[], handler: (ctx: any) => void): void;
  get(name: string): any;
  effect(fn: Generator<any, void, void> | (() => () => void), name?: string): void;
}
