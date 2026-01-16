# MCPB Runtime Integration - Requirements and Design Document

**Document Version:** 1.0
**Date:** 2025-11-20
**Project:** Releio (Windows Electron-based AI Chat Client)
**Status:** Draft for Implementation

---

## 1. Document Purpose and Scope

This document defines the requirements, design decisions, and implementation approach for adding **MCP Bundle (MCPB)** support to Releio, specifically:

- Bundling Node.js and Python runtimes within the installer
- Enabling Node.js and Python-based MCPB execution without requiring user-installed runtimes
- Maintaining security, offline support, and isolated runtime environments

**In Scope:**
- Windows 10/11 (64-bit) only
- Node.js and Python MCPB support
- Offline-first runtime distribution

**Out of Scope:**
- macOS/Linux support (future consideration)
- Binary MCPB support (already supported via existing MCP infrastructure)
- uv-based Python environment management (deferred)

---

## 2. Terminology

| Term | Definition |
|------|------------|
| **MCP (Model Context Protocol)** | Protocol for connecting LLMs with external tools and data sources |
| **MCPB (MCP Bundle)** | `.mcpb` ZIP archive containing an MCP server with `manifest.json` |
| **MCP Host/Client** | Releio application acting as an MCP client |
| **MCP Server** | Local process (Node.js/Python/binary) implementing the MCP protocol |
| **Embeddable Python** | Windows-specific minimal Python distribution for application embedding |
| **Portable Node.js** | Standalone Node.js distribution (ZIP format) requiring no installation |

---

## 3. Background and Objectives

### 3.1 Background

Anthropic's MCPB specification enables "one-click installable" MCP server distribution. Releio already supports MCP client functionality, and adding MCPB support will:

- Allow users to install `.mcpb` files with minimal setup
- Enable MCPB developers to distribute servers compatible with both Claude Desktop and Releio
- Reduce friction for users unfamiliar with Node.js/Python installation

### 3.2 Objectives

1. **MCPB Import/Management**: Enable users to import, enable/disable, and remove MCPB bundles
2. **Bundled Runtime Support**: Provide Node.js and Python runtimes within the Releio installer
3. **Offline Execution**: Support MCPB execution in offline environments (when MCPB includes dependencies)
4. **Security**: Avoid `ELECTRON_RUN_AS_NODE` vulnerabilities by using isolated runtimes

---

## 4. Constraints and Assumptions

1. **Platform**: Windows 10/11 (64-bit) only
2. **Electron**: Application is Electron-based with Node.js embedded
3. **Security**: `runAsNode` Fuse must remain **disabled** (no `ELECTRON_RUN_AS_NODE` usage)
4. **User Experience**: Users should **not** need to install Node.js/Python separately
5. **Offline Support**: MCPB bundles with dependencies (e.g., `node_modules`, `server/lib`) should work offline
6. **Repository Cleanliness**: Runtime binaries should **not** be committed to Git (download during build)

---

## 5. Functional Requirements

### 5.1 MCPB Management

**FR-01: MCPB Import**
- Users can select a `.mcpb` file to install an MCP server
- Import validates `manifest.json` and extracts metadata (name, description, icon)

**FR-02: MCPB Storage**
- MCPB bundles are extracted to: `%APPDATA%\Releio\mcp\bundles\<bundle-id>\<version>\`
- Multiple versions can coexist (latest version used by default)

**FR-03: MCPB List/Enable/Disable**
- UI displays installed MCPBs with enable/disable and delete options

### 5.2 Node.js Runtime Management

**FR-10: Node Runtime Bundling**
- Releio installer includes a standalone Node.js runtime (LTS 18 or 20)
- Runtime includes `npm` and `npx`

**FR-11: Node MCPB Execution**
- `server.type === "node"` MCPBs are executed using the bundled Node.js runtime
- `command: "node"` and `command: "npx"` are supported

**FR-12: Command Resolution**
- `manifest.json` commands are resolved to bundled runtime paths

### 5.3 Python Runtime Management

**FR-20: Python Runtime Bundling**
- Releio installer includes Windows embeddable Python distribution

**FR-21: Python MCPB Execution (`server/lib` Method)**
- `server.type === "python"` MCPBs with `server/lib` dependencies are officially supported
- `PYTHONPATH` is set to `server/lib` for execution

**FR-22: Python MCPB Execution (`server/venv` Method - Best Effort)**
- MCPBs with `server/venv` are supported by adding `server/venv/Lib/site-packages` to `PYTHONPATH`
- Full venv recreation is **not required** in v1

### 5.4 Process Management

**FR-30: MCP Server Process Lifecycle**
- Each MCP server runs as an independent child process
- STDIN/STDOUT are bridged to the MCP client layer
- Process lifecycle (start/stop/crash detection/restart) is managed by Main or Utility Process

**FR-31: Environment Variable Placeholder Resolution**
- `${__dirname}` placeholders are resolved to MCPB extraction directory
- `${user_config.xxx}` placeholders are resolved from user settings

**FR-32: User Configuration (`user_config`) Handling**
- UI collects configuration values defined in `manifest.json.user_config`
- Values are securely stored and passed to MCP server processes as environment variables

---

## 6. Non-Functional Requirements

**NFR-01: Security**
- Electron's `runAsNode` Fuse remains **disabled**
- MCP servers execute only from sandboxed runtimes (bundled Node.js/Python)
- API keys and secrets in environment variables are not logged

**NFR-02: Offline Operation**
- MCPBs with bundled dependencies (`node_modules`, `server/lib`) work without internet
- MCPBs requiring online package fetching (`npx`, `uv`) are clearly marked as online-only

**NFR-03: Performance**
- MCP server startup time: target <5 seconds for typical cases
- Idle servers auto-terminate after configurable timeout

**NFR-04: Installer Size**
- Bundled runtimes add approximately **+50-80MB** to installer size
- This is acceptable given the UX improvement

---

## 7. Design Alternatives and Selection

### 7.1 Node.js Runtime Options

#### Option A: Use Electron's Embedded Node via `ELECTRON_RUN_AS_NODE`

**Evaluation:**
- ✅ No additional runtime needed (zero size increase)
- ❌ Requires enabling `runAsNode` Fuse (security risk - LOTL attacks)
- ❌ Lacks `npm`/`npx` by default
- ❌ May conflict with future enterprise security requirements

**Decision:** ❌ **Rejected** (security concerns)

#### Option B: Bundle Standalone Node.js Runtime (Selected)

**Evaluation:**
- ✅ Independent from Electron's Node.js (no security concerns)
- ✅ Includes `npm`/`npx` for full MCPB compatibility
- ✅ Version updates controlled by Releio (not tied to Electron updates)
- ⚠️ Adds ~30MB to installer size (acceptable)

**Decision:** ✅ **Selected**

### 7.2 Python Runtime Options

#### Option C: Rely on User's System Python

**Evaluation:**
- ✅ No installer size increase
- ❌ Requires users to install Python separately
- ❌ Version fragmentation and `site-packages` pollution risks

**Decision:** ❌ **Rejected** (conflicts with "no user setup" requirement)

#### Option D: Bundle Embeddable Python with `server/lib` Support (Selected)

**Evaluation:**
- ✅ Embeddable Python designed for isolated, per-process `sys.path` control
- ✅ Compatible with MCPB `server/lib` vendoring strategy
- ✅ No system Python pollution (always clean)
- ⚠️ `server/venv` support requires workarounds (acceptable as best-effort)
- ⚠️ Adds ~20MB to installer size (acceptable)

**Decision:** ✅ **Selected**
- **Official support:** `server/lib` method
- **Best-effort support:** `server/venv` method (use `site-packages` only)

---

## 8. Adopted Architecture

### 8.1 Runtime File Layout

**After Installation:**

```
%LOCALAPPDATA%\Programs\Releio\
  releio.exe
  resources\
    app.asar
    runtimes\
      node\
        node.exe
        npm.cmd
        npx.cmd
        node_modules\npm\...
      python\
        python.exe
        python312.dll
        python312._pth
        ...
```

**MCPB Storage:**

```
%APPDATA%\Releio\
  mcp\
    bundles\
      <bundle-id>\
        <version>\
          manifest.json
          server\
            index.js / main.py
            lib\ or venv\
```

### 8.2 MCPB Execution Policy

**Node.js:**
- `server.type === "node"` + `command: "node"` or `"npx"` → Use bundled Node.js
- Other commands → Fallback to `PATH` resolution (with UI warning)

**Python:**
- `server.type === "python"`:
  - If `server/lib` exists → Use bundled Python with `PYTHONPATH=server/lib` (official)
  - If `server/venv` exists → Add `server/venv/Lib/site-packages` to `PYTHONPATH` (best-effort)

---

## 9. Component Architecture

### 9.1 Component Diagram

```
McpBundleManager
  - Import/validate/extract .mcpb files
  - Manage bundle list/enable/disable

McpRuntimeManager
  - Abstract runtime selection (Node/Python/Binary)
  - Provides: spawnServer(manifest, bundleDir, userConfig)

NodeRuntime
  - Resolve bundled Node.js paths
  - Spawn Node-based MCP servers

PythonRuntime
  - Resolve bundled Python paths
  - Configure PYTHONPATH for server/lib or server/venv

McpProcessSupervisor
  - Lifecycle management (start/stop/restart/crash detection)

Existing McpClient
  - Bridge child process STDIN/STDOUT to MCP protocol
```

### 9.2 MCPB Installation and Execution Sequence

1. User selects `.mcpb` file
2. `McpBundleManager` extracts ZIP and validates `manifest.json`
3. Bundle registered in internal extension list
4. User enables extension and configures `user_config` in UI
5. When MCP tools needed:
   - `McpRuntimeManager.spawnServer(...)` invoked
   - `NodeRuntime` or `PythonRuntime` spawns child process
   - `McpClient` bridges STDIN/STDOUT for MCP protocol communication

---

## 10. Build and Packaging Strategy

### 10.1 Runtime Acquisition

**Node.js:**
- Download: [https://nodejs.org/dist/v{VERSION}/node-v{VERSION}-win-x64.zip](https://nodejs.org/dist/)
- Example: `node-v20.18.0-win-x64.zip`
- Extract contents to: `build/runtimes/node/`

**Python:**
- Download: [https://www.python.org/ftp/python/{VERSION}/python-{VERSION}-embed-amd64.zip](https://www.python.org/ftp/python/)
- Example: `python-3.12.6-embed-amd64.zip`
- Extract contents to: `build/runtimes/python/`

### 10.2 electron-builder Configuration

**electron-builder.yml:**

```yaml
appId: com.mosaan.releio
productName: Releio
directories:
  output: dist
  buildResources: build

files:
  - dist/**
  - package.json

extraResources:
  - from: build/runtimes
    to: runtimes
    filter:
      - '**/*'

win:
  target:
    - nsis
  artifactName: '${productName}-Setup-${version}.${ext}'
  icon: build/icon.ico

nsis:
  oneClick: true
  perMachine: false
  allowToChangeInstallationDirectory: true
  deleteAppDataOnUninstall: false
```

### 10.3 Build Script (Download and Extract Runtimes)

**package.json scripts:**

```json
{
  "scripts": {
    "build:prepare": "node ./scripts/prepare-runtimes.mjs",
    "build:electron": "electron-builder -c electron-builder.yml",
    "build": "pnpm run build:prepare && pnpm run build:electron"
  }
}
```

**scripts/prepare-runtimes.mjs:**

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import extract from 'extract-zip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.join(__dirname, '..', 'build');
const RUNTIMES_DIR = path.join(BUILD_DIR, 'runtimes');

const NODE_VERSION = '20.18.0';
const PYTHON_VERSION = '3.12.6';

const NODE_ZIP_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
const NODE_ZIP_PATH = path.join(BUILD_DIR, `node-v${NODE_VERSION}-win-x64.zip`);
const NODE_EXTRACT_DIR = path.join(RUNTIMES_DIR, 'node');

const PYTHON_ZIP_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const PYTHON_ZIP_PATH = path.join(BUILD_DIR, `python-${PYTHON_VERSION}-embed-amd64.zip`);
const PYTHON_EXTRACT_DIR = path.join(RUNTIMES_DIR, 'python');

async function downloadFile(url, dest) {
  console.log(`[prepare-runtimes] Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);

  const fileStream = fs.createWriteStream(dest);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
}

async function prepareRuntime(zipUrl, zipPath, extractDir) {
  await fs.promises.mkdir(BUILD_DIR, { recursive: true });
  await fs.promises.mkdir(RUNTIMES_DIR, { recursive: true });

  if (!fs.existsSync(zipPath)) {
    await downloadFile(zipUrl, zipPath);
  }

  await fs.promises.rm(extractDir, { recursive: true, force: true });
  await extract(zipPath, { dir: extractDir });
}

async function main() {
  try {
    console.log('[prepare-runtimes] Preparing Node and Python runtimes...');
    await prepareRuntime(NODE_ZIP_URL, NODE_ZIP_PATH, NODE_EXTRACT_DIR);
    await prepareRuntime(PYTHON_ZIP_URL, PYTHON_ZIP_PATH, PYTHON_EXTRACT_DIR);
    console.log('[prepare-runtimes] Done');
  } catch (err) {
    console.error('[prepare-runtimes] Failed:', err);
    process.exit(1);
  }
}

main();
```

**.gitignore additions:**

```gitignore
/build/runtimes/
/build/*.zip
```

### 10.4 Runtime Path Resolution Utility

**src/main/runtimePaths.ts:**

```typescript
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export function getRuntimesRoot(): string {
  if (!app.isPackaged) {
    // Development: use project root build/runtimes
    return path.join(process.cwd(), 'build', 'runtimes');
  }
  // Production: use resources/runtimes
  return path.join(process.resourcesPath, 'runtimes');
}

export function getNodeBinaryPath(): string {
  const runtimesRoot = getRuntimesRoot();
  const nodeBin = path.join(runtimesRoot, 'node', 'node.exe');
  if (!fs.existsSync(nodeBin)) {
    throw new Error(`Node runtime not found at ${nodeBin}`);
  }
  return nodeBin;
}

export function getNpxBinaryPath(): string {
  const runtimesRoot = getRuntimesRoot();
  const npxBin = path.join(runtimesRoot, 'node', 'npx.cmd');
  if (!fs.existsSync(npxBin)) {
    throw new Error(`npx not found at ${npxBin}`);
  }
  return npxBin;
}

export function getPythonBinaryPath(): string {
  const runtimesRoot = getRuntimesRoot();
  const pythonBin = path.join(runtimesRoot, 'python', 'python.exe');
  if (!fs.existsSync(pythonBin)) {
    throw new Error(`Python runtime not found at ${pythonBin}`);
  }
  return pythonBin;
}
```

---

## 11. Implementation Phases

### Phase 1: Runtime Bundling Infrastructure (Initial)

**Goal:** Prepare build system to download/bundle runtimes

**Tasks:**
1. Create `scripts/prepare-runtimes.mjs`
2. Add `build:prepare` npm script
3. Update `electron-builder.yml` with `extraResources`
4. Add `build/runtimes/` and `build/*.zip` to `.gitignore`
5. Test build process end-to-end

### Phase 2: Runtime Path Resolution

**Goal:** Enable runtime-aware code in Main process

**Tasks:**
1. Implement `src/main/runtimePaths.ts`
2. Add unit tests for path resolution (dev vs production)

### Phase 3: Node.js MCPB Support

**Goal:** Execute Node-based MCPB bundles

**Tasks:**
1. Implement `src/main/mcp/runtime/NodeRuntime.ts`
2. Integrate with `McpRuntimeManager`
3. Test with sample Node MCPB

### Phase 4: Python MCPB Support

**Goal:** Execute Python-based MCPB bundles

**Tasks:**
1. Implement `src/main/mcp/runtime/PythonRuntime.ts`
2. Support `server/lib` method (official)
3. Support `server/venv` method (best-effort)
4. Test with sample Python MCPB

### Phase 5: MCPB Management UI

**Goal:** Enable users to import/manage MCPB bundles

**Tasks:**
1. Implement `McpBundleManager`
2. Create UI for MCPB import/list/enable/disable
3. Implement `user_config` configuration UI
4. End-to-end testing

---

## 12. Testing Strategy

**Unit Tests:**
- Path resolution logic (`runtimePaths.ts`)
- Command substitution (`NodeRuntime`, `PythonRuntime`)

**Integration Tests:**
- MCPB import and extraction
- Node/Python server process spawning
- Environment variable placeholder resolution

**End-to-End Tests:**
- Install sample Node MCPB → verify tool execution
- Install sample Python MCPB → verify tool execution
- Test in offline environment (no internet)

**Security Tests:**
- Verify `runAsNode` Fuse disabled
- Confirm `ELECTRON_RUN_AS_NODE` attacks fail

---

## 13. Future Enhancements

- **macOS/Linux Support:** Port runtime bundling to other platforms
- **Python + uv Support:** Official support for uv-based manifests
- **MCPB Signature Verification:** Trusted publisher model
- **Resource Limits:** CPU/memory/timeout limits for MCP servers
- **Runtime Auto-Updates:** Check for Node/Python updates independently

---

## 14. References

- [MCP Specification](https://modelcontextprotocol.io/)
- [MCPB Bundle Format](https://github.com/anthropics/desktop-mcp-bundles)
- [Electron Builder Documentation](https://www.electron.build/)
- [Node.js Binary Downloads](https://nodejs.org/en/download/)
- [Python Embeddable Package](https://www.python.org/downloads/windows/)

---

**Document End**
