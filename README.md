# ts-dup-finder

Find duplicate files by comparing byte size first and only hashing files that share a size.

```js
import { findDuplicates, groupBySize } from './src/index.js';

const groups = await findDuplicates(['./a.txt', './b.txt', './c.txt']);
// groups is string[][] — each inner array holds two or more paths
// that all have identical contents.

const buckets = await groupBySize(['./a.txt', './b.txt', './c.txt']);
// buckets is a Map<number, string[]> keyed by byte size.
```

## Why this exists

Hashing every file in a tree is the obvious way to find duplicates, and it is also the slowest. Two files with different lengths cannot be identical, so the size check is a cheap filter that eliminates most candidates before any I/O-heavy hashing happens. The trade-off is an extra `stat` pass over every path: if your tree is dominated by files that all happen to share a size, you pay that cost without saving much. For the usual case — many distinct sizes, a few real duplicates — this is a clear win.

## The awkward edge

`findDuplicates` does not throw on bad input paths. Missing files, directories, and unreadable entries are silently skipped, because a scan over a large tree should not abort when one entry disappears mid-run. If you need to know which paths were rejected, call `groupBySize` yourself and compare the keys against your input list. `groupBySize` does throw a `TypeError` if you pass something other than an array of strings.

Duplicate groups are returned in the order their first member appeared in the input array, and each group lists its members in that same input order. The first path in a group is just the first one seen — it is not a "canonical" or "original" file.
