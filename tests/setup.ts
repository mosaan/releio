import { config } from 'dotenv'

// Set environment variables BEFORE loading any modules
// This ensures paths are resolved correctly

// Set default user data path for tests if not already set
if (!process.env.MAIN_VITE_USER_DATA_PATH) {
  process.env.MAIN_VITE_USER_DATA_PATH = './tmp'
}

// Load environment variables for test environment
config()

// Note: We don't mock process.send here because:
// 1. Vitest uses process.send for its own IPC communication
// 2. The backend logger already handles missing process.send gracefully
// 3. Mocking it interferes with Vitest's worker pool communication