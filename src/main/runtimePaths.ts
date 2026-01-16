/**
 * runtimePaths.ts
 *
 * Utilities for resolving paths to bundled Node.js and Python runtimes.
 * These runtimes are used for executing MCPB (MCP Bundle) servers.
 *
 * In development mode:
 *   - Runtimes are located at: PROJECT_ROOT/build/runtimes/
 *
 * In production mode (packaged app):
 *   - Runtimes are located at: process.resourcesPath/runtimes/
 */

import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Returns the root directory containing Node.js and Python runtimes.
 *
 * Development: PROJECT_ROOT/build/runtimes
 * Production: resources/runtimes (via process.resourcesPath)
 */
export function getRuntimesRoot(): string {
  if (!app.isPackaged) {
    // Development: use project root build/runtimes
    return path.join(process.cwd(), 'build', 'runtimes');
  }

  // Production: use resources/runtimes
  return path.join(process.resourcesPath, 'runtimes');
}

/**
 * Returns the path to the bundled Node.js binary (node.exe).
 *
 * @throws {Error} If node.exe is not found at the expected location
 */
export function getNodeBinaryPath(): string {
  const runtimesRoot = getRuntimesRoot();
  const nodeBin = path.join(runtimesRoot, 'node', 'node.exe');

  if (!fs.existsSync(nodeBin)) {
    throw new Error(
      `Node.js runtime not found at ${nodeBin}. ` +
        `Please ensure the build:prepare script has been run before packaging.`
    );
  }

  return nodeBin;
}

/**
 * Returns the path to the bundled npx binary (npx.cmd).
 *
 * @throws {Error} If npx.cmd is not found at the expected location
 */
export function getNpxBinaryPath(): string {
  const runtimesRoot = getRuntimesRoot();
  const npxBin = path.join(runtimesRoot, 'node', 'npx.cmd');

  if (!fs.existsSync(npxBin)) {
    throw new Error(
      `npx not found at ${npxBin}. ` +
        `Please ensure the build:prepare script has been run before packaging.`
    );
  }

  return npxBin;
}

/**
 * Returns the path to the bundled npm binary (npm.cmd).
 *
 * @throws {Error} If npm.cmd is not found at the expected location
 */
export function getNpmBinaryPath(): string {
  const runtimesRoot = getRuntimesRoot();
  const npmBin = path.join(runtimesRoot, 'node', 'npm.cmd');

  if (!fs.existsSync(npmBin)) {
    throw new Error(
      `npm not found at ${npmBin}. ` +
        `Please ensure the build:prepare script has been run before packaging.`
    );
  }

  return npmBin;
}

/**
 * Returns the path to the bundled Python binary (python.exe).
 *
 * @throws {Error} If python.exe is not found at the expected location
 */
export function getPythonBinaryPath(): string {
  const runtimesRoot = getRuntimesRoot();
  const pythonBin = path.join(runtimesRoot, 'python', 'python.exe');

  if (!fs.existsSync(pythonBin)) {
    throw new Error(
      `Python runtime not found at ${pythonBin}. ` +
        `Please ensure the build:prepare script has been run before packaging.`
    );
  }

  return pythonBin;
}

/**
 * Returns the directory containing the Node.js runtime.
 *
 * This is useful when you need to set PATH or other environment variables
 * that reference the Node.js runtime directory.
 */
export function getNodeRuntimeDir(): string {
  const runtimesRoot = getRuntimesRoot();
  return path.join(runtimesRoot, 'node');
}

/**
 * Returns the directory containing the Python runtime.
 *
 * This is useful when you need to set PYTHONPATH or other environment variables
 * that reference the Python runtime directory.
 */
export function getPythonRuntimeDir(): string {
  const runtimesRoot = getRuntimesRoot();
  return path.join(runtimesRoot, 'python');
}

/**
 * Checks if the Node.js runtime is available.
 *
 * @returns true if node.exe exists, false otherwise
 */
export function isNodeRuntimeAvailable(): boolean {
  try {
    getNodeBinaryPath();
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if the Python runtime is available.
 *
 * @returns true if python.exe exists, false otherwise
 */
export function isPythonRuntimeAvailable(): boolean {
  try {
    getPythonBinaryPath();
    return true;
  } catch {
    return false;
  }
}
