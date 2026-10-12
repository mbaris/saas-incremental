import { SAVE_KEY } from '../constants.ts';

interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
type LoadResult<T> =
  { status: 'loaded'; value: T } | { status: 'empty' | 'unavailable' | 'invalid' };

/** Access is deferred because even reading localStorage can throw in restricted browsers. */
export function createSaveStore<T>(
  storage: () => StoragePort,
  codec: { encode(value: T): string; decode(raw: string): T },
  key = SAVE_KEY,
) {
  return {
    load(): LoadResult<T> {
      let raw: string | null;
      try {
        raw = storage().getItem(key);
      } catch {
        return { status: 'unavailable' };
      }
      if (raw === null) return { status: 'empty' };
      try {
        return { status: 'loaded', value: codec.decode(raw) };
      } catch {
        return { status: 'invalid' };
      }
    },
    save(value: T): boolean {
      try {
        storage().setItem(key, codec.encode(value));
        return true;
      } catch {
        return false;
      }
    },
  };
}
