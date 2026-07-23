/**
 * Central registry of available sources. Today there is one (Novel Phoenix);
 * new sites are added by registering another adapter here.
 */
import { MadaraSource, NOVELPHOENIX_CONFIG } from './madaraSource';
import { NovelSource } from './types';

const sources: Record<string, NovelSource> = {};

function register(source: NovelSource) {
  sources[source.id] = source;
}

register(new MadaraSource(NOVELPHOENIX_CONFIG));

export const DEFAULT_SOURCE_ID = NOVELPHOENIX_CONFIG.id;

export function getSource(id: string): NovelSource {
  const s = sources[id];
  if (!s) throw new Error(`Unknown source: ${id}`);
  return s;
}

export function listSources(): NovelSource[] {
  return Object.values(sources);
}
