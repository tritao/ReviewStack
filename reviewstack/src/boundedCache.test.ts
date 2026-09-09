import BoundedCache from './boundedCache';

test('evicts the least recently used entry by count', () => {
  const cache = new BoundedCache<string, number>(2, 100);
  cache.set('a', 1, 1);
  cache.set('b', 2, 1);
  expect(cache.get('a')).toBe(1);
  cache.set('c', 3, 1);
  expect(cache.get('b')).toBeUndefined();
  expect(cache.get('a')).toBe(1);
  expect(cache.get('c')).toBe(3);
});

test('evicts entries until the weight limit is satisfied', () => {
  const cache = new BoundedCache<string, number>(10, 5);
  cache.set('a', 1, 3);
  cache.set('b', 2, 3);
  expect(cache.get('a')).toBeUndefined();
  expect(cache.get('b')).toBe(2);
  expect(cache.size).toBe(1);
});

test('does not retain an entry larger than the entire budget', () => {
  const cache = new BoundedCache<string, number>(10, 5);
  cache.set('large', 1, 6);
  expect(cache.get('large')).toBeUndefined();
  expect(cache.size).toBe(0);
});
