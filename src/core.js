// Core duplicate-detection logic.
//
// Strategy: group files by byte size first. Two files can only be duplicates
// if they have the same size, so hashing every file up front is wasteful.
// We only hash within size groups that contain more than one member.
//
// Trade-off: we do two passes over the filesystem (stat, then hash). For a
// tree with many unique-sized files this is much cheaper than hashing
// everything. For a tree where nearly every file shares a size, we pay the
// stat cost on top of the hashing cost. That is the deliberate choice: the
// common case is many distinct sizes, and hashing is the expensive part.
//
// Duplicates are reported as groups of paths. A group of size 1 is not a
// duplicate and is never returned. The representative of a group (the first
// path encountered) is arbitrary but deterministic for a given input order.

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

/**
 * Group paths by their byte size.
 *
 * Files that cannot be stat'd (missing, permission denied) are skipped
 * rather than throwing: a scan of a large tree should not abort because one
 * entry vanished between listing and stat. Callers that need strictness can
 * stat themselves before calling.
 *
 * @param {string[]} paths
 * @returns {Promise<Map<number, string[]>>} size -> paths, insertion ordered
 */
export async function groupBySize(paths) {
  if (!Array.isArray(paths)) {
    throw new TypeError('paths must be an array of strings');
  }
  const groups = new Map();
  for (const p of paths) {
    if (typeof p !== 'string') {
      throw new TypeError('paths must be an array of strings');
    }
    let info;
    try {
      info = await stat(p);
    } catch {
      continue;
    }
    if (!info.isFile()) {
      continue;
    }
    const size = info.size;
    const bucket = groups.get(size);
    if (bucket) {
      bucket.push(p);
    } else {
      groups.set(size, [p]);
    }
  }
  return groups;
}

/**
 * Hash a file's contents with SHA-256.
 *
 * We stream rather than read the whole file into memory so that large
 * duplicate candidates do not blow up the heap.
 *
 * @param {string} path
 * @returns {Promise<string>} lowercase hex digest
 */
async function hashFile(path) {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

/**
 * Find groups of duplicate files among the given paths.
 *
 * Only regular files are considered. Paths that cannot be read are skipped.
 * The returned groups preserve the relative order in which their first
 * member appeared in the input.
 *
 * @param {string[]} paths
 * @returns {Promise<string[][]>} each inner array has length >= 2
 */
export async function findDuplicates(paths) {
  const bySize = await groupBySize(paths);
  const results = [];
  for (const bucket of bySize.values()) {
    if (bucket.length < 2) {
      continue;
    }
    // Hash each member of the size bucket, grouping by digest.
    const byHash = new Map();
    for (const p of bucket) {
      let digest;
      try {
        digest = await hashFile(p);
      } catch {
        continue;
      }
      const existing = byHash.get(digest);
      if (existing) {
        existing.push(p);
      } else {
        byHash.set(digest, [p]);
      }
    }
    for (const group of byHash.values()) {
      if (group.length >= 2) {
        results.push(group);
      }
    }
  }
  return results;
}
