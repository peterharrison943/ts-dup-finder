import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findDuplicates, groupBySize } from '../src/index.js';

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'ts-dup-finder-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('groupBySize buckets files by byte length', async () => {
  await withTempDir(async (dir) => {
    const a = join(dir, 'a.txt');
    const b = join(dir, 'b.txt');
    const c = join(dir, 'c.txt');
    await writeFile(a, 'hello');
    await writeFile(b, 'world');
    await writeFile(c, 'hi');

    const groups = await groupBySize([a, b, c]);
    assert.equal(groups.size, 2);
    assert.deepEqual(groups.get(5), [a, b]);
    assert.deepEqual(groups.get(2), [c]);
  });
});

test('groupBySize skips missing paths without throwing', async () => {
  await withTempDir(async (dir) => {
    const real = join(dir, 'real.txt');
    await writeFile(real, 'data');
    const groups = await groupBySize([real, join(dir, 'nope.txt')]);
    assert.equal(groups.size, 1);
    assert.deepEqual(groups.get(4), [real]);
  });
});

test('groupBySize skips directories', async () => {
  await withTempDir(async (dir) => {
    const sub = join(dir, 'sub');
    await mkdir(sub);
    const groups = await groupBySize([sub]);
    assert.equal(groups.size, 0);
  });
});

test('groupBySize rejects non-array input', async () => {
  await assert.rejects(() => groupBySize('not an array'), TypeError);
});

test('groupBySize rejects non-string entries', async () => {
  await assert.rejects(() => groupBySize([42]), TypeError);
});

test('findDuplicates finds identical files', async () => {
  await withTempDir(async (dir) => {
    const a = join(dir, 'a.txt');
    const b = join(dir, 'b.txt');
    const c = join(dir, 'c.txt');
    await writeFile(a, 'same content');
    await writeFile(b, 'same content');
    await writeFile(c, 'different!');

    const groups = await findDuplicates([a, b, c]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0], [a, b]);
  });
});

test('findDuplicates returns empty array when nothing is duplicated', async () => {
  await withTempDir(async (dir) => {
    const a = join(dir, 'a.txt');
    const b = join(dir, 'b.txt');
    await writeFile(a, 'one');
    await writeFile(b, 'two');

    const groups = await findDuplicates([a, b]);
    assert.deepEqual(groups, []);
  });
});

test('findDuplicates ignores same-size files with different content', async () => {
  await withTempDir(async (dir) => {
    const a = join(dir, 'a.bin');
    const b = join(dir, 'b.bin');
    await writeFile(a, Buffer.from([1, 2, 3, 4]));
    await writeFile(b, Buffer.from([4, 3, 2, 1]));

    const groups = await findDuplicates([a, b]);
    assert.deepEqual(groups, []);
  });
});

test('findDuplicates separates multiple distinct duplicate sets', async () => {
  await withTempDir(async (dir) => {
    const a1 = join(dir, 'a1');
    const a2 = join(dir, 'a2');
    const b1 = join(dir, 'b1');
    const b2 = join(dir, 'b2');
    await writeFile(a1, 'aaaa');
    await writeFile(a2, 'aaaa');
    await writeFile(b1, 'bbbb');
    await writeFile(b2, 'bbbb');

    const groups = await findDuplicates([a1, a2, b1, b2]);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups[0], [a1, a2]);
    assert.deepEqual(groups[1], [b1, b2]);
  });
});

test('findDuplicates groups three or more copies together', async () => {
  await withTempDir(async (dir) => {
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    const c = join(dir, 'c');
    await writeFile(a, 'triple');
    await writeFile(b, 'triple');
    await writeFile(c, 'triple');

    const groups = await findDuplicates([a, b, c]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0], [a, b, c]);
  });
});

test('findDuplicates skips unreadable paths', async () => {
  await withTempDir(async (dir) => {
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    await writeFile(a, 'payload');
    await writeFile(b, 'payload');

    const groups = await findDuplicates([a, b, join(dir, 'ghost')]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0], [a, b]);
  });
});

test('findDuplicates handles empty files as duplicates', async () => {
  await withTempDir(async (dir) => {
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    await writeFile(a, '');
    await writeFile(b, '');

    const groups = await findDuplicates([a, b]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0], [a, b]);
  });
});

test('findDuplicates handles binary content', async () => {
  await withTempDir(async (dir) => {
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    const bytes = Buffer.from([0, 255, 0, 255, 128]);
    await writeFile(a, bytes);
    await writeFile(b, bytes);

    const groups = await findDuplicates([a, b]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0], [a, b]);
  });
});
