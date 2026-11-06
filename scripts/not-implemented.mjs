#!/usr/bin/env node
// Reserved script shim: the real implementation belongs to a later lane
// (docs/delivery/02_PARALLEL_WORKSTREAMS.md). Exits non-zero on purpose —
// a shim exiting 0 would silently read as "passed" in CI and logs.
const [command = "this script", owner = "unassigned", ...rest] = process.argv.slice(2);
console.error(`[highcastle] \`${command}\` is reserved but not implemented yet.`);
console.error(`[highcastle] owner: ${owner}. ${rest.join(" ") || "See lane ownership docs."}`);
process.exit(1);
