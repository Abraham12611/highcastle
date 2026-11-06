/**
 * Deep-freeze helper for policy outputs.
 *
 * Policy decisions, effective budgets and approved executions are immutable
 * by contract: nothing downstream (least of all model-produced code paths)
 * may widen an allowance by mutating the returned object. `deepFreeze` makes
 * that structural rather than conventional.
 */

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key], seen);
  }
  return Object.freeze(value);
}
