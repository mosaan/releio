# Electron AI Starter Template

A modern, full-featured Electron application template with TypeScript, React, Drizzle ORM and Vercel AI SDK. This template provides everything you need to build desktop applications with AI capabilities. Stop scaffolding, start building!

| Home | AI Chat |
|------|---------|
| ![Home](resources/home.png) | ![AI Chat](resources/ai.png) |

| Database | Settings |
|----------|----------|
| ![Database](resources/data.png) | ![Settings](resources/settings.png) |

## Features

### 🔧 Build Tooling
- **[Electron](https://github.com/electron/electron) + [Vite](https://github.com/vitejs/vite)** - Lightning-fast development with hot reload and optimized production builds
- **[SWC](https://github.com/swc-project/swc)** - Ultra-fast TypeScript/JavaScript compilation for maximum speed

### 🛠️ Development Tooling
- **[TypeScript](https://github.com/microsoft/TypeScript)** - Full type safety across main and renderer processes
- **[ESLint](https://github.com/eslint/eslint)** - Code linting with TypeScript and React configurations
- **[Prettier](https://github.com/prettier/prettier)** - Automated code formatting for consistent style
- **[Electron Log](https://github.com/megahertz/electron-log)** - Unified logging across main and renderer processes
- **[Vitest](https://github.com/vitest-dev/vitest)** - Fast unit testing with TypeScript support

### 🔄 Backend
- **[Utility Process](https://www.electronjs.org/docs/latest/api/utility-process)** - Dedicated backend process that prevents heavy disk I/O and CPU-bound operations from [blocking the main process](https://www.electronjs.org/docs/latest/tutorial/performance#3-blocking-the-main-process)
- **[libsql](https://github.com/tursodatabase/libsql) + [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm)** - Type-safe database operations with auto-migrations and modern SQLite compatibility

### 🎨 UI & Design
- **[React](https://github.com/facebook/react) 19** - Latest React with full TypeScript support
- **[Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) 4** - Modern styling with CSS variables and theming
- **[Shadcn/ui](https://github.com/shadcn-ui/ui)** - Beautiful, accessible component library (New York style)

### 🤖 AI Integration
- **[Vercel AI SDK v5](https://github.com/vercel/ai)** - Unified interface for OpenAI, Anthropic, and Google AI providers
- **[MCP Server Integration](https://modelcontextprotocol.io)** - Connect to external tools via Model Context Protocol
  - Multi-step tool calling with automatic execution
  - Support for multiple MCP servers simultaneously
  - Comprehensive logging of tool interactions
- **[Assistant UI](https://github.com/Yonom/assistant-ui)** - Production-ready chat interface with streaming support

## Get Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [pnpm](https://pnpm.io/) package manager

### Installation

1. Fork & clone the repository

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

The `.env` file should contain:
```
MAIN_VITE_USER_DATA_PATH=./tmp
```

This configures the development data directory for logs and database.

### Development

Start the development server with hot reload:

```bash
pnpm run dev
```

This will:
- Build the Electron main process and backend utility process
- Build the preload scripts
- Start the Vite dev server for the renderer process
- Launch the Electron application

### Add Shadcn Components

```bash
pnpm run shadcn add [component-name]
```

### Database Operations

```bash
# Generate database migrations
pnpm run drizzle-kit generate

# Reset development database
pnpm run db:reset
```

### Code Quality

```bash
# Type check
pnpm run typecheck

# Format code
pnpm run format

# Lint code
pnpm run lint
```

### Building for Production

```bash
# Build for Windows
pnpm run build:win

# Build for macOS
pnpm run build:mac

# Build for Linux
pnpm run build:linux
```

## Future Roadmap

### 🤖 Advanced AI Capabilities  
- **Mastra Integration for Agentic Workflows** - Integrate Mastra framework to add production-ready agentic capabilities including workflows, agent memory, RAG pipelines, and evaluation systems while maintaining compatibility with existing AI SDK setup
