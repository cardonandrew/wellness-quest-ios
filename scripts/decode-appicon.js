// Decodes the base64-encoded 1024px app icon into the asset catalog.
// Needed because binary PNGs can't be pushed via the GitHub API text tools;
// Xcode auto-generates all device icon sizes from this single 1024px source.
// Also reconstructs www/index.html from parts (too large for GitHub API).
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- Reconstruct www/index.html from parts if needed ---
const indexPath = join(root, 'www/index.html');
const partsDir = join(root, 'www/parts');
if (existsSync(partsDir)) {
  const parts = readdirSync(partsDir)
    .filter(f => f.startsWith('index.html.part'))
    .sort();
  if (parts.length > 0) {
    // Check if index.html is truncated (smaller than expected 1.1MB)
    let needsRebuild = true;
    if (existsSync(indexPath)) {
      const stat = readFileSync(indexPath);
      // Expected size is ~1,103,477 bytes; if significantly smaller, it's truncated
      if (stat.length > 1000000) {
        console.log('[decode-appicon] www/index.html looks complete, skipping rebuild.');
        needsRebuild = false;
      } else {
        console.log(`[decode-appicon] www/index.html is truncated (${stat.length} bytes), rebuilding from parts.`);
      }
    }
    if (needsRebuild) {
      const chunks = parts.map(p => readFileSync(join(partsDir, p)));
      const combined = Buffer.concat(chunks);
      writeFileSync(indexPath, combined);
      console.log(`[decode-appicon] rebuilt www/index.html from ${parts.length} parts (${combined.length} bytes).`);
    }
  }
}

// --- Decode app icon ---
const outPath = join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');

// Skip if a valid PNG already exists (e.g. local dev machines)
if (existsSync(outPath)) {
  const head = readFileSync(outPath).subarray(0, 8);
  if (head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    console.log('[decode-appicon] AppIcon-512@2x.png already valid, skipping.');
    process.exit(0);
  }
  console.log('[decode-appicon] existing file is not a valid PNG, overwriting.');
}

const b64Parts = [];
for (let i = 1; ; i++) {
  const partPath = join(root, `scripts/appicon-1024.b64.part${i}`);
  if (!existsSync(partPath)) break;
  b64Parts.push(readFileSync(partPath, 'utf8'));
}
if (b64Parts.length === 0) {
  console.error('[decode-appicon] no base64 parts found!');
  process.exit(1);
}
const b64 = b64Parts.join('').replace(/\s+/g, '');
writeFileSync(outPath, Buffer.from(b64, 'base64'));
console.log('[decode-appicon] wrote', outPath);
