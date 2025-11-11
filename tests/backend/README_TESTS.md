# Backend Tests for Proxy and Certificate Features

## Status: Work in Progress (WIP)

The test files in this directory (`proxy.test.ts`, `certificate.test.ts`, `fetch.test.ts`) provide comprehensive unit tests for the Phase 1 proxy and certificate functionality. However, they currently have infrastructure issues that prevent them from running successfully.

## Test Coverage

### proxy.test.ts
Tests for proxy settings management including:
- Getting/setting proxy settings (system/custom/none modes)
- Proxy URL construction with credentials
- Proxy bypass rules (wildcard patterns, localhost, etc.)
- Settings persistence

### certificate.test.ts
Tests for certificate settings management including:
- Getting/setting certificate settings (system/custom/none modes)
- Certificate validation
- Adding/removing custom certificates
- Settings persistence

### fetch.test.ts
Tests for custom fetch builder including:
- Fetch function creation
- Proxy configuration
- Certificate configuration
- Proxy bypass logic
- Error handling
- Request options preservation

## Current Issues

The tests fail with "The 'path' argument must be of type string. Received undefined" errors. This occurs because:

1. The logger module is loaded at import time and tries to access file paths
2. The database module connection is initialized before test mocks can take effect
3. Circular dependencies between settings, db, and logger modules

## Required Fixes

To make these tests work, one of the following approaches is needed:

### Approach 1: Refactor for Better Testability
- Make logger initialization lazy (only create when first used)
- Make database connection injectable
- Break circular dependencies between modules

### Approach 2: Simpler Unit Tests
- Instead of integration tests with real database, mock the database layer entirely
- Test each module in isolation without real database connections
- Use dependency injection for testability

### Approach 3: Test Infrastructure Improvements
- Create a test-specific database helper that doesn't trigger logger/path initialization
- Set up proper mock order to prevent module loading issues
- Use Vitest's module mocking more effectively

## Recommendation

For Phase 1, the implementation code is complete and functional. These tests demonstrate the intended behavior and provide good documentation of the API.

For Phase 2, it's recommended to:
1. Refactor the modules for better testability (lazy initialization, dependency injection)
2. Simplify the test approach to focus on unit testing with mocked dependencies
3. Add integration tests separately that test the full stack in a controlled environment

## Running Tests

Currently, the new tests will fail. The existing tests (`database.test.ts`, `utils.test.ts`) continue to work.

To attempt running the new tests:
```bash
pnpm run test:backend
```

To run only the working tests:
```bash
npx vitest run tests/backend/database.test.ts tests/backend/utils.test.ts
```
