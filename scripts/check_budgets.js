#!/usr/bin/env node

/**
 * Performance Budget Validator
 * Analyzes Next.js production build artifacts and verifies compliance with performance-budget.json
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BUDGET_CONFIG_PATH = path.join(rootDir, 'performance-budget.json');
const NEXT_STATIC_DIR = path.join(rootDir, '.next', 'static');
const PUBLIC_DIR = path.join(rootDir, 'public');

function getGzipSize(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath);
    const compressed = zlib.gzipSync(fileContent);
    return compressed.length;
  } catch {
    return 0;
  }
}

function getRawSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

function scanDirectory(dir, filterExt) {
  let files = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(scanDirectory(fullPath, filterExt));
    } else if (filterExt.some(ext => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

function runBudgetAudit() {
  console.log('--------------------------------------------------');
  console.log('RUNNING PERFORMANCE BUDGET AUDIT');
  console.log('--------------------------------------------------');

  if (!fs.existsSync(BUDGET_CONFIG_PATH)) {
    console.error('❌ Error: performance-budget.json not found!');
    process.exit(1);
  }

  const budgetConfig = JSON.parse(fs.readFileSync(BUDGET_CONFIG_PATH, 'utf-8'));
  const sizeBudgets = budgetConfig[0]?.resourceSizes || [];

  const scriptBudget = sizeBudgets.find(b => b.resourceType === 'script')?.budget || 250; // KB
  const cssBudget = sizeBudgets.find(b => b.resourceType === 'stylesheet')?.budget || 50; // KB
  const imageBudget = sizeBudgets.find(b => b.resourceType === 'image')?.budget || 150; // KB

  let hasError = false;

  // 1. Audit Client JavaScript Chunks
  const jsFiles = scanDirectory(path.join(NEXT_STATIC_DIR, 'chunks'), ['.js']);
  let totalJsGzip = 0;
  let maxSingleChunk = { name: '', size: 0 };

  jsFiles.forEach(file => {
    const gzipSize = getGzipSize(file);
    totalJsGzip += gzipSize;
    if (gzipSize > maxSingleChunk.size) {
      maxSingleChunk = { name: path.basename(file), size: gzipSize };
    }
  });

  const totalJsKb = (totalJsGzip / 1024).toFixed(1);
  const maxChunkKb = (maxSingleChunk.size / 1024).toFixed(1);

  console.log(`📦 JavaScript Bundles:`);
  console.log(`   - Total Chunks: ${jsFiles.length} files`);
  console.log(`   - Largest Chunk (${maxSingleChunk.name}): ${maxChunkKb} KB gzip (Budget: ${scriptBudget} KB)`);

  if (maxSingleChunk.size / 1024 > scriptBudget) {
    console.error(`   ❌ FAIL: Chunk ${maxSingleChunk.name} exceeds budget of ${scriptBudget} KB!`);
    hasError = true;
  } else {
    console.log(`   ✅ PASS: All JS chunks within individual budget.`);
  }

  // 2. Audit CSS Bundles
  const cssFiles = scanDirectory(path.join(NEXT_STATIC_DIR, 'css'), ['.css']);
  let totalCssGzip = 0;
  cssFiles.forEach(file => {
    totalCssGzip += getGzipSize(file);
  });
  const totalCssKb = (totalCssGzip / 1024).toFixed(1);
  console.log(`\n🎨 CSS Bundles:`);
  console.log(`   - Total CSS Size: ${totalCssKb} KB gzip (Budget: ${cssBudget} KB)`);

  if (totalCssGzip / 1024 > cssBudget) {
    console.error(`   ❌ FAIL: CSS bundle exceeds budget of ${cssBudget} KB!`);
    hasError = true;
  } else {
    console.log(`   ✅ PASS: CSS within budget.`);
  }

  // 3. Audit Public Images & PWA Icons
  const imageFiles = scanDirectory(PUBLIC_DIR, ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg']);
  let totalImageBytes = 0;
  imageFiles.forEach(file => {
    totalImageBytes += getRawSize(file);
  });
  const totalImageKb = (totalImageBytes / 1024).toFixed(1);
  console.log(`\n🖼️ Public Assets / Images:`);
  console.log(`   - Total Image Assets: ${imageFiles.length} files (${totalImageKb} KB, Budget: ${imageBudget} KB)`);

  if (totalImageBytes / 1024 > imageBudget) {
    console.error(`   ❌ FAIL: Total image assets exceed budget of ${imageBudget} KB!`);
    hasError = true;
  } else {
    console.log(`   ✅ PASS: Static images within budget.`);
  }

  console.log('--------------------------------------------------');
  if (hasError) {
    console.error('❌ PERFORMANCE BUDGET AUDIT FAILED');
    process.exit(1);
  } else {
    console.log('✅ ALL PERFORMANCE BUDGETS PASSED SUCCESSFULLY');
    console.log('--------------------------------------------------');
  }
}

runBudgetAudit();
