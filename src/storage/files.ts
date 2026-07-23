/**
 * On-device file storage for downloaded content. Chapter text is stored as
 * JSON (paragraph array) under the app's document directory; cover images are
 * downloaded alongside. Nothing here leaves the phone.
 */
import * as FileSystem from 'expo-file-system';
import { ChapterContent } from '@/source/types';

const ROOT = FileSystem.documentDirectory + 'novels/';

async function ensureDir(dir: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

function novelDir(novelId: string): string {
  // novelId is `source:slug`; ':' is unsafe in paths on some platforms.
  return ROOT + encodeURIComponent(novelId) + '/';
}

export async function saveChapterContent(
  novelId: string,
  chapterId: string,
  content: ChapterContent,
): Promise<string> {
  const dir = novelDir(novelId);
  await ensureDir(dir);
  const path = dir + encodeURIComponent(chapterId) + '.json';
  await FileSystem.writeAsStringAsync(
    path,
    JSON.stringify({ paragraphs: content.paragraphs }),
  );
  return path;
}

export async function readChapterContent(path: string): Promise<ChapterContent | null> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  const raw = await FileSystem.readAsStringAsync(path);
  return JSON.parse(raw) as ChapterContent;
}

export async function deleteChapterFile(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
}

export async function downloadCover(
  novelId: string,
  url: string,
): Promise<string | null> {
  try {
    const dir = novelDir(novelId);
    await ensureDir(dir);
    const ext = (url.split('?')[0].match(/\.(jpe?g|png|webp)$/i)?.[1] ?? 'jpg').toLowerCase();
    const path = dir + 'cover.' + ext;
    const res = await FileSystem.downloadAsync(url, path);
    return res.uri;
  } catch {
    return null;
  }
}

/** Remove all downloaded files for a novel (keeps DB rows intact). */
export async function deleteNovelFiles(novelId: string): Promise<void> {
  const dir = novelDir(novelId);
  const info = await FileSystem.getInfoAsync(dir);
  if (info.exists) await FileSystem.deleteAsync(dir, { idempotent: true });
}

export async function totalStorageBytes(): Promise<number> {
  const info = await FileSystem.getInfoAsync(ROOT, { size: true });
  return info.exists && 'size' in info ? (info.size as number) : 0;
}
