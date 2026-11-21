// Public entry point for ts-dup-finder.
//
// We re-export from core.js so consumers can import a single stable module
// path while the implementation stays free to grow more files.
export { findDuplicates, groupBySize } from './core.js';
