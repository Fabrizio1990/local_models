#!/usr/bin/env node

/**
 * Model Download Script
 *
 * This script downloads AI models from HuggingFace and prepares them for GitHub Releases
 *
 * Usage:
 *   HF_TOKEN=your_token_here node scripts/download-models.js
 *
 * Or set the token in your environment:
 *   export HF_TOKEN=your_token_here
 *   node scripts/download-models.js
 *
 * What it does:
 *   1. Downloads Qwen3.5-0.8B-Q4_K_M.gguf (~508 MB)
 *   2. Downloads Qwen3.5-2B-Q4_K_M.gguf (~1.19 GB)
 *   3. Downloads Qwen3.5-4B-Q4_K_M.gguf (~2.55 GB) - split into 2 parts
 *   4. Downloads Qwen3.5-9B-Q4_K_M.gguf (~5.29 GB) - split into 3 parts
 *   5. Validates all file sizes
 *
 * Output directory: ./models
 *
 * Note: HuggingFace token is required for these models.
 * Get your token at: https://huggingface.co/settings/tokens
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Load .env file if present
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

// Get HuggingFace token from environment
const HF_TOKEN = process.env.HF_TOKEN;

// Model definitions
const MODELS = [
  {
    name: 'Qwen3.5-0.8B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/6ab461498e2023f6e3c1baea90a8f0fe38ab64d0/Qwen3.5-0.8B-Q4_K_M.gguf?download=true',
    expectedSize: 532517120, // ~508 MB
    split: false
  },
  {
    name: 'Qwen3.5-2B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae/Qwen3.5-2B-Q4_K_M.gguf?download=true',
    expectedSize: 1280835840, // ~1.19 GB
    split: false
  },
  {
    name: 'Qwen3.5-4B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q4_K_M.gguf?download=true',
    expectedSize: 2740937888, // ~2.55 GB
    split: true,
    splitSize: 1.9 * 1024 * 1024 * 1024 // 1.9 GB (safely under 2GB GitHub limit)
  },
  {
    name: 'Qwen3.5-9B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/3885219b6810b007914f3a7950a8d1b469d598a5/Qwen3.5-9B-Q4_K_M.gguf?download=true',
    expectedSize: 5680522464, // ~5.29 GB
    split: true,
    splitSize: 1.9 * 1024 * 1024 * 1024 // 1.9 GB (safely under 2GB GitHub limit)
  }
];

const OUTPUT_DIR = path.join(process.cwd(), 'models');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`✓ Created directory: ${OUTPUT_DIR}\n`);
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Download a file with progress tracking and HuggingFace authentication
 */
function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`Starting download: ${path.basename(outputPath)}`);
    console.log(`URL: ${url}\n`);

    const file = fs.createWriteStream(outputPath);
    let downloadedBytes = 0;
    let totalBytes = 0;
    let lastProgress = 0;

    // Parse URL to add headers
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {}
    };

    // Add Authorization header if token is available
    if (HF_TOKEN) {
      options.headers['Authorization'] = `Bearer ${HF_TOKEN}`;
      console.log('✓ Using HuggingFace token for authentication\n');
    } else {
      console.warn('⚠ Warning: No HF_TOKEN found. Download may fail for gated models.\n');
    }

    const request = https.get(options, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        console.log(`Following redirect to: ${redirectUrl}\n`);
        file.close();
        fs.unlinkSync(outputPath);
        return downloadFile(redirectUrl, outputPath).then(resolve).catch(reject);
      }

      if (response.statusCode === 401) {
        file.close();
        fs.unlinkSync(outputPath);
        reject(new Error('Authentication failed (401). Please provide a valid HF_TOKEN.\nGet your token at: https://huggingface.co/settings/tokens'));
        return;
      }

      if (response.statusCode === 403) {
        file.close();
        fs.unlinkSync(outputPath);
        reject(new Error('Access forbidden (403). You may need to accept the model license on HuggingFace.'));
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(outputPath);
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }

      totalBytes = parseInt(response.headers['content-length'], 10);
      console.log(`Total size: ${formatBytes(totalBytes)}`);

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        file.write(chunk);

        // Update progress every 1%
        const progress = Math.floor((downloadedBytes / totalBytes) * 100);
        if (progress > lastProgress) {
          lastProgress = progress;
          const downloaded = formatBytes(downloadedBytes);
          const total = formatBytes(totalBytes);
          const bar = '█'.repeat(Math.floor(progress / 2)) + '░'.repeat(50 - Math.floor(progress / 2));
          process.stdout.write(`\r[${bar}] ${progress}% (${downloaded} / ${total})`);
        }
      });

      response.on('end', () => {
        file.end();
        console.log('\n✓ Download complete!\n');
        resolve(downloadedBytes);
      });

      response.on('error', (err) => {
        file.close();
        fs.unlinkSync(outputPath);
        reject(err);
      });
    });

    request.on('error', (err) => {
      file.close();
      fs.unlinkSync(outputPath);
      reject(err);
    });

    file.on('error', (err) => {
      file.close();
      fs.unlinkSync(outputPath);
      reject(err);
    });
  });
}

/**
 * Write a single part of a split file
 */
function writePart(inputPath, outputPath, start, end, partNum, partSize) {
  return new Promise((resolve, reject) => {
    console.log(`Creating part ${partNum}...`);
    const readStream = fs.createReadStream(inputPath, { start, end });
    const writeStream = fs.createWriteStream(outputPath);

    let written = 0;
    readStream.on('data', (chunk) => {
      written += chunk.length;
      const progress = Math.floor((written / partSize) * 100);
      process.stdout.write(`\rPart ${partNum}: ${progress}% (${formatBytes(written)} / ${formatBytes(partSize)})`);
    });

    readStream.pipe(writeStream);
    writeStream.on('finish', () => {
      console.log(`\n✓ Part ${partNum} complete!\n`);
      resolve({ path: outputPath, size: fs.statSync(outputPath).size });
    });
    writeStream.on('error', reject);
  });
}

/**
 * Split a large file into parts
 */
async function splitFile(inputPath, splitSize) {
  console.log(`Splitting file: ${path.basename(inputPath)}`);
  console.log(`Split size: ${formatBytes(splitSize)}\n`);

  const stats = fs.statSync(inputPath);
  const totalSize = stats.size;
  const ext = path.extname(inputPath);
  const baseName = path.basename(inputPath, ext);
  const dir = path.dirname(inputPath);

  // Ensure splitSize is an integer
  const splitSizeInt = Math.floor(splitSize);
  const numParts = Math.ceil(totalSize / splitSizeInt);

  const parts = [];
  for (let i = 0; i < numParts; i++) {
    const start = i * splitSizeInt;
    const end = Math.min(start + splitSizeInt - 1, totalSize - 1);
    const partSize = end - start + 1;
    const partPath = path.join(dir, `${baseName}.part${i + 1}${ext}`);

    const part = await writePart(inputPath, partPath, start, end, i + 1, partSize);
    parts.push({ name: path.basename(partPath), size: part.size });
  }

  // Delete original file
  console.log('Removing original file...');
  fs.unlinkSync(inputPath);
  console.log('✓ Original file removed\n');

  return parts;
}

/**
 * Main execution
 */
async function main() {
  console.log('='.repeat(70));
  console.log('AI Model Download & Preparation Script');
  console.log('='.repeat(70));
  console.log('\n');

  // Check for HuggingFace token
  if (!HF_TOKEN) {
    console.error('❌ ERROR: HF_TOKEN environment variable is required!\n');
    console.error('These models require authentication to download.\n');
    console.error('To fix this:');
    console.error('1. Get your token at: https://huggingface.co/settings/tokens');
    console.error('2. Run the script with your token:\n');
    console.error('   HF_TOKEN=your_token_here node scripts/download-models.js\n');
    console.error('   Or set it in your environment:');
    console.error('   export HF_TOKEN=your_token_here\n');
    process.exit(1);
  }

  console.log('✓ HuggingFace token found');
  console.log('✓ Token (first 10 chars): ' + HF_TOKEN.substring(0, 10) + '...\n');

  const results = [];

  for (const model of MODELS) {
    try {
      const outputPath = path.join(OUTPUT_DIR, model.name);

      console.log('─'.repeat(70));
      console.log(`MODEL: ${model.name}`);
      console.log('─'.repeat(70));
      console.log('');

      // Download
      const downloadedSize = await downloadFile(model.url, outputPath);

      // Validate size (within 5% tolerance)
      const sizeDiff = Math.abs(downloadedSize - model.expectedSize);
      const tolerance = model.expectedSize * 0.05;

      if (sizeDiff > tolerance) {
        console.warn(`⚠ Warning: Downloaded size (${formatBytes(downloadedSize)}) differs from expected (${formatBytes(model.expectedSize)})\n`);
      }

      // Split if needed
      if (model.split) {
        const parts = await splitFile(outputPath, model.splitSize);
        results.push({
          name: model.name,
          split: true,
          parts
        });
      } else {
        results.push({
          name: model.name,
          split: false,
          size: downloadedSize
        });
      }

    } catch (err) {
      console.error(`\n✗ Error processing ${model.name}:`, err.message);
      process.exit(1);
    }
  }

  // Summary
  console.log('='.repeat(70));
  console.log('DOWNLOAD SUMMARY');
  console.log('='.repeat(70));
  console.log('');

  for (const result of results) {
    if (result.split) {
      console.log(`✓ ${result.name} (split into ${result.parts.length} parts):`);
      for (const part of result.parts) {
        console.log(`  - ${part.name}: ${formatBytes(part.size)}`);
      }
    } else {
      console.log(`✓ ${result.name}: ${formatBytes(result.size)}`);
    }
  }

  console.log('\n');
  console.log('='.repeat(70));
  console.log('All models downloaded and prepared successfully!');
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log('='.repeat(70));
  console.log('\n');
  console.log('Next steps:');
  console.log('1. Upload these files to GitHub Releases');
  console.log('2. Update the app to download from GitHub instead of HuggingFace');
  console.log('');
}

// Run the script
main().catch((err) => {
  console.error('\n✗ Fatal error:', err);
  process.exit(1);
});
