/**
 * E2E_PREFIX is applied to every record name created by the test suite.
 * global-teardown.ts queries for this prefix to identify and delete test data.
 * Change it here only — it is used throughout seed helpers, specs, and teardown.
 */
export const E2E_PREFIX = '[E2E]'
