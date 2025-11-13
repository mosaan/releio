# Renderer (Frontend) Tests

This directory contains tests for React components and contexts in the renderer process.

## Setup

To run renderer tests, you need to install the following dependencies:

```bash
pnpm add -D @testing-library/react @testing-library/user-event @testing-library/jest-dom happy-dom
```

## Running Tests

After installing the dependencies, add the following script to `package.json`:

```json
{
  "scripts": {
    "test:renderer": "vitest run --config vitest.config.renderer.ts",
    "test:renderer:watch": "vitest --config vitest.config.renderer.ts"
  }
}
```

Then run:

```bash
pnpm run test:renderer
```

## Test Structure

### SessionManager.test.tsx

Tests for the SessionManager React context, including:
- Session initialization and loading
- Creating new sessions
- Switching between sessions
- Updating session metadata
- Deleting sessions
- Model selection management

### Future Test Files

- `SessionList.test.tsx` - Tests for SessionList component UI interactions
- `ChatPanel.test.tsx` - Tests for ChatPanel component rendering and behavior
- `AIRuntimeProvider.test.tsx` - Tests for AI streaming integration

## Writing Tests

Example test structure:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'

it('should perform action', async () => {
  const mockFn = vi.fn().mockResolvedValue(ok('result'))
  window.backend.someMethod = mockFn

  render(<YourComponent />)

  const button = screen.getByRole('button')
  await userEvent.click(button)

  await waitFor(() => {
    expect(mockFn).toHaveBeenCalled()
  })
})
```

## Mocking

The `tests/setup-renderer.ts` file provides mocks for:
- `window.backend` - All IPC methods
- `window.connectBackend` - Backend connection

Additional mocks can be added as needed.
