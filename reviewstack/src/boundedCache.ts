/** A small weighted LRU cache for worker-owned derived data. */
export default class BoundedCache<K, V> {
  private entries = new Map<K, {value: V; weight: number}>();
  private totalWeight = 0;

  constructor(
    private maxEntries: number,
    private maxWeight: number,
  ) {}

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (entry == null) {
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, weight: number): void {
    const existing = this.entries.get(key);
    if (existing != null) {
      this.totalWeight -= existing.weight;
      this.entries.delete(key);
    }
    const boundedWeight = Math.max(0, weight);
    this.entries.set(key, {value, weight: boundedWeight});
    this.totalWeight += boundedWeight;
    while (this.entries.size > this.maxEntries || this.totalWeight > this.maxWeight) {
      const oldestKey = this.entries.keys().next().value as K | undefined;
      if (oldestKey == null) {
        break;
      }
      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      this.totalWeight -= oldest?.weight ?? 0;
    }
  }

  delete(key: K): void {
    const entry = this.entries.get(key);
    if (entry != null) {
      this.totalWeight -= entry.weight;
      this.entries.delete(key);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
