/**
 * Central registry of available sources. Today there is one (Novel Phoenix);
 * new sites are added by registering another adapter here.
 */
import { NovelPhoenixSource } from './novelPhoenixSource';
import { NovelSource } from './types';

const sources: Record<string, NovelSource> = {};

function register(source: NovelSource) {
  sources[source.id] = source;
}

const novelPhoenix = new NovelPhoenixSource();
register(novelPhoenix);

export const DEFAULT_SOURCE_ID = novelPhoenix.id;

export function getSource(id: string): NovelSource {
  const s = sources[id];
  if (!s) throw new Error(`Unknown source: ${id}`);
  return s;
}

export function listSources(): NovelSource[] {
  return Object.values(sources);
}
