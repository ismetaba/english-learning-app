import fs from 'node:fs';

/** String-keyed JSON cache on disk for the slow model steps, so rebuilding
 *  the content database replays earlier answers instead of re-asking. */
export class JsonCache<T> {
  private map: Map<string, T>;
  private dirty = 0;

  constructor(private file: string) {
    this.map = fs.existsSync(file) ? new Map(Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) : new Map();
  }

  get(key: string): T | undefined {
    return this.map.get(key);
  }

  set(key: string, value: T): void {
    this.map.set(key, value);
    if (++this.dirty >= 25) this.save();
  }

  save(): void {
    fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.map), null, 1));
    this.dirty = 0;
  }
}
