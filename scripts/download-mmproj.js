#!/usr/bin/env node

/**
 * Vision Projector (mmproj) Download Script
 *
 * Downloads mmproj-F16.gguf files from HuggingFace for each Qwen 3.5 model
 * and updates models.json with vision/thinking support fields.
 *
 * Usage:
 *   HF_TOKEN=your_token_here node scripts/download-mmproj.js
 *
 * Or set the token in your environment / .env file:
 *   export HF_TOKEN=your_token_here
 *   node scripts/download-mmproj.js
 *
 * What it does:
 *   1. Downloads mmproj-F16.gguf for Qwen3.5-0.8B (~668 MB)
 *   2. Downloads mmproj-F16.gguf for Qwen3.5-2B (~668 MB)
 *   3. Downloads mmproj-F16.gguf for Qwen3.5-4B (~668 MB)
 *   4. Downloads mmproj-F16.gguf for Qwen3.5-9B (~668 MB)
 *   5. Renames each file to avoid conflicts (mmproj-qwen3.5-{size}-F16.gguf)
 *   6. Updates models.json with supportsVision, supportsThinking, and projector fields
 *
 * Output directory: ./models
 *
 * After running this script:
 *   1. Upload the 4 mmproj files to GitHub Release v2.0.0-models:
 *      gh release upload v2.0.0-models models/mmproj-qwen3.5-*.gguf
 *   2. Commit and push models.json
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

const HF_TOKEN = process.env.HF_TOKEN;
const GITHUB_REPO = 'Fabrizio1990/local_models';
const RELEASE_TAG = 'v2.0.0-models';

// mmproj definitions — one per Qwen 3.5 model size
const MMPROJ_MODELS = [
  {
    hfUrl: 'https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/mmproj-F16.gguf',
    outputName: 'mmproj-qwen3.5-0.8b-F16.gguf',
    modelId: 'qwen3.5-0.8b-q4km',
  },
  {
    hfUrl: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/mmproj-F16.gguf',
    outputName: 'mmproj-qwen3.5-2b-F16.gguf',
    modelId: 'qwen3.5-2b-q4km',
  },
  {
    hfUrl: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/mmproj-F16.gguf',
    outputName: 'mmproj-qwen3.5-4b-F16.gguf',
    modelId: 'qwen3.5-4b-q4km',
  },
  {
    hfUrl: 'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/mmproj-F16.gguf',
    outputName: 'mmproj-qwen3.5-9b-F16.gguf',
    modelId: 'qwen3.5-9b-q4km',
  },
];

const OUTPUT_DIR = path.join(process.cwd(), 'models');
const MODELS_JSON_PATH = path.join(__dirname, '..', 'models.json');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`✓ Created directory: ${OUTPUT_DIR}\n`);
}

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

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {},
    };

    if (HF_TOKEN) {
      options.headers['Authorization'] = `Bearer ${HF_TOKEN}`;
      console.log('✓ Using HuggingFace token for authentication\n');
    } else {
      console.warn('⚠ Warning: No HF_TOKEN found. Download may fail for gated models.\n');
    }

    const request = https.get(options, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        console.log(`Following redirect...\n`);
        file.close();
        fs.unlinkSync(outputPath);
        return downloadFile(redirectUrl, outputPath).then(resolve).catch(reject);
      }

      if (response.statusCode === 401) {
        file.close();
        fs.unlinkSync(outputPath);
        reject(new Error('Authentication failed (401). Please provide a valid HF_TOKEN.'));
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
 * Update models.json with vision and thinking support fields
 */
function updateModelsJson(results) {
  console.log('─'.repeat(70));
  console.log('Updating models.json with vision/thinking fields...');
  console.log('─'.repeat(70));
  console.log('');

  if (!fs.existsSync(MODELS_JSON_PATH)) {
    console.error('✗ models.json not found at:', MODELS_JSON_PATH);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MODELS_JSON_PATH, 'utf8'));
  console.log(`✓ Loaded models.json (${manifest.models.length} models)\n`);

  // Build a map of downloaded mmproj results by modelId
  const mmprojByModelId = {};
  for (const r of results) {
    mmprojByModelId[r.modelId] = r;
  }

  for (const model of manifest.models) {
    const mmproj = mmprojByModelId[model.id];

    if (mmproj) {
      // Qwen model with mmproj downloaded
      model.supportsVision = true;
      model.supportsThinking = true;
      model.visionProjectorFileName = mmproj.outputName;
      model.visionProjectorSize = mmproj.size;
      model.visionProjectorDownloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/${RELEASE_TAG}/${mmproj.outputName}`;
      console.log(`  ✓ ${model.id}: supportsVision=true, supportsThinking=true, mmproj=${mmproj.outputName} (${formatBytes(mmproj.size)})`);
    } else {
      // Non-Qwen model (Gemma etc.)
      model.supportsVision = false;
      model.supportsThinking = false;
      console.log(`  ✓ ${model.id}: supportsVision=false, supportsThinking=false`);
    }
  }

  fs.writeFileSync(MODELS_JSON_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\n✓ models.json updated successfully\n`);
}

async function main() {
  console.log('='.repeat(70));
  console.log('Vision Projector (mmproj) Download Script');
  console.log('='.repeat(70));
  console.log('\n');

  if (!HF_TOKEN) {
    console.error('❌ ERROR: HF_TOKEN environment variable is required!\n');
    console.error('Usage:');
    console.error('  HF_TOKEN=your_token_here node scripts/download-mmproj.js\n');
    process.exit(1);
  }

  console.log('✓ HuggingFace token found');
  console.log('✓ Token (first 10 chars): ' + HF_TOKEN.substring(0, 10) + '...\n');

  const results = [];

  for (const mmproj of MMPROJ_MODELS) {
    try {
      const outputPath = path.join(OUTPUT_DIR, mmproj.outputName);

      console.log('─'.repeat(70));
      console.log(`MMPROJ: ${mmproj.outputName} (for ${mmproj.modelId})`);
      console.log('─'.repeat(70));
      console.log('');

      // Skip if already downloaded
      if (fs.existsSync(outputPath)) {
        const existingSize = fs.statSync(outputPath).size;
        console.log(`✓ Already exists: ${mmproj.outputName} (${formatBytes(existingSize)})`);
        console.log('  Skipping download.\n');
        results.push({
          ...mmproj,
          size: existingSize,
        });
        continue;
      }

      const downloadedSize = await downloadFile(mmproj.hfUrl, outputPath);

      results.push({
        ...mmproj,
        size: downloadedSize,
      });
    } catch (err) {
      console.error(`\n✗ Error downloading ${mmproj.outputName}:`, err.message);
      process.exit(1);
    }
  }

  // Summary
  console.log('='.repeat(70));
  console.log('DOWNLOAD SUMMARY');
  console.log('='.repeat(70));
  console.log('');

  for (const r of results) {
    console.log(`✓ ${r.outputName}: ${formatBytes(r.size)} (for ${r.modelId})`);
  }

  console.log('\n');

  // Update models.json
  updateModelsJson(results);

  console.log('='.repeat(70));
  console.log('Next steps:');
  console.log('='.repeat(70));
  console.log('');
  console.log('1. Upload mmproj files to GitHub Release:');
  console.log(`   gh release upload ${RELEASE_TAG} models/mmproj-qwen3.5-*.gguf`);
  console.log('');
  console.log('2. Commit and push models.json:');
  console.log('   git add models.json');
  console.log('   git commit -m "Add vision projector support and thinking mode to catalog"');
  console.log('   git push');
  console.log('');
}

main().catch((err) => {
  console.error('\n✗ Fatal error:', err);
  process.exit(1);
});
