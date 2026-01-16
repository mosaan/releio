/**
 * prepare-runtimes.mjs
 *
 * Downloads and extracts Node.js and Python runtimes for bundling with electron-builder.
 * This script is run as part of the build process before electron-builder packages the app.
 *
 * Usage: node scripts/prepare-runtimes.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import extract from 'extract-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.join(__dirname, '..');
const BUILD_DIR = path.join(PROJECT_ROOT, 'build');
const RUNTIMES_DIR = path.join(BUILD_DIR, 'runtimes');

// Runtime versions
const NODE_VERSION = '20.18.0';
const PYTHON_VERSION = '3.12.6';

// Download URLs
const NODE_ZIP_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
const NODE_ZIP_FILENAME = `node-v${NODE_VERSION}-win-x64.zip`;
const NODE_ZIP_PATH = path.join(BUILD_DIR, NODE_ZIP_FILENAME);
const NODE_EXTRACT_DIR = path.join(RUNTIMES_DIR, 'node');

const PYTHON_ZIP_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const PYTHON_ZIP_FILENAME = `python-${PYTHON_VERSION}-embed-amd64.zip`;
const PYTHON_ZIP_PATH = path.join(BUILD_DIR, PYTHON_ZIP_FILENAME);
const PYTHON_EXTRACT_DIR = path.join(RUNTIMES_DIR, 'python');

/**
 * Ensure a directory exists, creating it if necessary
 */
async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

/**
 * Download a file from a URL using Node's built-in https module
 */
async function downloadFile(url, dest) {
  console.log(`[prepare-runtimes] Downloading ${url}`);

  // Check if file already exists
  if (fs.existsSync(dest)) {
    console.log(`[prepare-runtimes] File already exists: ${dest}, skipping download`);
    return;
  }

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    https.get(url, (response) => {
      // Handle redirects (3xx status codes)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        console.log(`[prepare-runtimes] Following redirect to ${response.headers.location}`);
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
        return;
      }

      const totalBytes = parseInt(response.headers['content-length'], 10);
      let downloadedBytes = 0;
      let lastProgress = 0;

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const progress = Math.floor((downloadedBytes / totalBytes) * 100);

        // Log progress every 10%
        if (progress >= lastProgress + 10) {
          console.log(`[prepare-runtimes] Progress: ${progress}%`);
          lastProgress = progress;
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`[prepare-runtimes] Downloaded successfully: ${dest}`);
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

/**
 * Extract a ZIP file to a destination directory
 */
async function extractZipFile(zipPath, destDir) {
  console.log(`[prepare-runtimes] Extracting ${zipPath} to ${destDir}`);
  await ensureDir(destDir);
  await extract(zipPath, { dir: destDir });
  console.log(`[prepare-runtimes] Extraction complete`);
}

/**
 * Move contents from a nested directory to parent directory
 * (Node.js ZIP contains a top-level directory we want to flatten)
 */
async function flattenDirectory(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  // If there's only one entry and it's a directory, move its contents up
  if (entries.length === 1 && entries[0].isDirectory()) {
    const nestedDir = path.join(dir, entries[0].name);
    const nestedEntries = await fs.promises.readdir(nestedDir);

    console.log(`[prepare-runtimes] Flattening directory structure`);

    // Move all files from nested directory to parent
    for (const entry of nestedEntries) {
      const src = path.join(nestedDir, entry);
      const dest = path.join(dir, entry);
      await fs.promises.rename(src, dest);
    }

    // Remove the now-empty nested directory
    await fs.promises.rmdir(nestedDir);
  }
}

/**
 * Prepare Node.js runtime
 */
async function prepareNode() {
  console.log('[prepare-runtimes] === Preparing Node.js runtime ===');

  await ensureDir(BUILD_DIR);
  await ensureDir(RUNTIMES_DIR);

  // Download Node.js ZIP
  await downloadFile(NODE_ZIP_URL, NODE_ZIP_PATH);

  // Clean up existing extracted files
  if (fs.existsSync(NODE_EXTRACT_DIR)) {
    console.log(`[prepare-runtimes] Removing existing Node.js runtime at ${NODE_EXTRACT_DIR}`);
    await fs.promises.rm(NODE_EXTRACT_DIR, { recursive: true, force: true });
  }

  // Extract Node.js ZIP
  await extractZipFile(NODE_ZIP_PATH, NODE_EXTRACT_DIR);

  // Flatten directory structure (node-v20.x.x-win-x64/* -> node/*)
  await flattenDirectory(NODE_EXTRACT_DIR);

  // Verify node.exe exists
  const nodeExe = path.join(NODE_EXTRACT_DIR, 'node.exe');
  if (fs.existsSync(nodeExe)) {
    console.log(`[prepare-runtimes] ✓ Node.js runtime ready at ${NODE_EXTRACT_DIR}`);
  } else {
    throw new Error(`Node.js runtime extraction failed: node.exe not found at ${nodeExe}`);
  }
}

/**
 * Prepare Python runtime
 */
async function preparePython() {
  console.log('[prepare-runtimes] === Preparing Python runtime ===');

  await ensureDir(BUILD_DIR);
  await ensureDir(RUNTIMES_DIR);

  // Download Python ZIP
  await downloadFile(PYTHON_ZIP_URL, PYTHON_ZIP_PATH);

  // Clean up existing extracted files
  if (fs.existsSync(PYTHON_EXTRACT_DIR)) {
    console.log(`[prepare-runtimes] Removing existing Python runtime at ${PYTHON_EXTRACT_DIR}`);
    await fs.promises.rm(PYTHON_EXTRACT_DIR, { recursive: true, force: true });
  }

  // Extract Python ZIP (embeddable package extracts directly without nested folder)
  await extractZipFile(PYTHON_ZIP_PATH, PYTHON_EXTRACT_DIR);

  // Verify python.exe exists
  const pythonExe = path.join(PYTHON_EXTRACT_DIR, 'python.exe');
  if (fs.existsSync(pythonExe)) {
    console.log(`[prepare-runtimes] ✓ Python runtime ready at ${PYTHON_EXTRACT_DIR}`);
  } else {
    throw new Error(`Python runtime extraction failed: python.exe not found at ${pythonExe}`);
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    console.log('[prepare-runtimes] Starting runtime preparation...');
    console.log(`[prepare-runtimes] Build directory: ${BUILD_DIR}`);
    console.log(`[prepare-runtimes] Runtimes directory: ${RUNTIMES_DIR}`);
    console.log('');

    await prepareNode();
    console.log('');
    await preparePython();
    console.log('');

    console.log('[prepare-runtimes] ✓ All runtimes prepared successfully');
    console.log('[prepare-runtimes] Ready for electron-builder packaging');
  } catch (err) {
    console.error('[prepare-runtimes] ✗ Failed:', err.message);
    console.error(err);
    process.exit(1);
  }
}

main();
