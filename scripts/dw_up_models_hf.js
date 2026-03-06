#!/usr/bin/env node

/**
 * Download & Upload Models to HuggingFace Hub
 *
 * This script downloads Qwen3.5 GGUF models (Q4_K_M quantization) from HuggingFace
 * and re-uploads them to a personal HuggingFace repository for easy access from
 * Android apps with local AI inference.
 *
 * No file splitting is needed since HuggingFace supports files up to 50 GB.
 *
 * Prerequisites:
 *   1. pip install huggingface_hub
 *   2. huggingface-cli login  (use a Write-access token)
 *
 * Usage:
 *   HF_TOKEN=your_token_here node scripts/dw_up_models_hf.js
 *
 * Models downloaded:
 *   - Qwen3.5-0.8B-Q4_K_M.gguf  (~508 MB)
 *   - Qwen3.5-2B-Q4_K_M.gguf    (~1.19 GB)
 *   - Qwen3.5-4B-Q4_K_M.gguf    (~2.55 GB)
 *   - Qwen3.5-9B-Q4_K_M.gguf    (~5.29 GB)
 *
 * Destination: https://huggingface.co/Fabrizio1990/android-llm-models
 *
 * Original models by Qwen/Alibaba (Apache 2.0 license).
 * GGUF conversions by unsloth.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { execSync } = require('child_process');

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

// Config
const HF_TOKEN = process.env.HF_TOKEN;
const HF_REPO = 'Fabrizio1990/android-llm-models';
const OUTPUT_DIR = path.join(process.cwd(), 'models');

const MODELS = [
  {
    name: 'Qwen3.5-0.8B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/6ab461498e2023f6e3c1baea90a8f0fe38ab64d0/Qwen3.5-0.8B-Q4_K_M.gguf?download=true',
    expectedSize: 532517120
  },
  {
    name: 'Qwen3.5-2B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae/Qwen3.5-2B-Q4_K_M.gguf?download=true',
    expectedSize: 1280835840
  },
  {
    name: 'Qwen3.5-4B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q4_K_M.gguf?download=true',
    expectedSize: 2740937888
  },
  {
    name: 'Qwen3.5-9B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/3885219b6810b007914f3a7950a8d1b469d598a5/Qwen3.5-9B-Q4_K_M.gguf?download=true',
    expectedSize: 5680522464
  }
];

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${path.basename(outputPath)}`);
    console.log(`URL: ${url}\n`);

    const file = fs.createWriteStream(outputPath);
    let downloadedBytes = 0;
    let totalBytes = 0;
    let lastProgress = 0;

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {}
    };

    if (HF_TOKEN) {
      options.headers['Authorization'] = `Bearer ${HF_TOKEN}`;
    }

    const request = https.get(options, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlinkSync(outputPath);
        return downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(outputPath);
        reject(new Error(`HTTP ${response.statusCode} for ${path.basename(outputPath)}`));
        return;
      }

      totalBytes = parseInt(response.headers['content-length'], 10);
      console.log(`Size: ${formatBytes(totalBytes)}`);

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        file.write(chunk);
        const progress = Math.floor((downloadedBytes / totalBytes) * 100);
        if (progress > lastProgress) {
          lastProgress = progress;
          const bar = '█'.repeat(Math.floor(progress / 2)) + '░'.repeat(50 - Math.floor(progress / 2));
          process.stdout.write(`\r[${bar}] ${progress}% (${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)})`);
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

function uploadToHuggingFace(localPath, fileName) {
  console.log(`Uploading ${fileName} to ${HF_REPO}...`);
  try {
    execSync(
      `huggingface-cli upload "${HF_REPO}" "${localPath}" "${fileName}"`,
      { stdio: 'inherit' }
    );
    console.log(`✓ Uploaded ${fileName}\n`);
  } catch (err) {
    throw new Error(`Upload failed for ${fileName}: ${err.message}`);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Download & Upload Models to HuggingFace Hub');
  console.log(`Destination: https://huggingface.co/${HF_REPO}`);
  console.log('='.repeat(60));
  console.log('');

  if (!HF_TOKEN) {
    console.error('❌ HF_TOKEN is required.\n');
    console.error('  HF_TOKEN=your_token node scripts/dw_up_models_hf.js\n');
    console.error('Get your token at: https://huggingface.co/settings/tokens');
    process.exit(1);
  }

  // Check huggingface-cli is installed
  try {
    execSync('huggingface-cli version', { stdio: 'pipe' });
  } catch {
    console.error('❌ huggingface-cli not found.\n');
    console.error('  pip install huggingface_hub');
    process.exit(1);
  }

  // Create the HF repo if it doesn't exist
  console.log(`Creating repo ${HF_REPO} (if not exists)...`);
  try {
    execSync(
      `huggingface-cli repo create "${HF_REPO.split('/')[1]}" --type model -y 2>/dev/null || true`,
      { stdio: 'pipe' }
    );
  } catch {
    // Repo already exists, that's fine
  }
  console.log('');

  for (const model of MODELS) {
    const outputPath = path.join(OUTPUT_DIR, model.name);

    console.log('─'.repeat(60));
    console.log(`MODEL: ${model.name}`);
    console.log('─'.repeat(60));
    console.log('');

    // Download
    const size = await downloadFile(model.url, outputPath);

    // Validate
    const diff = Math.abs(size - model.expectedSize);
    if (diff > model.expectedSize * 0.05) {
      console.warn(`⚠ Size mismatch: got ${formatBytes(size)}, expected ${formatBytes(model.expectedSize)}\n`);
    }

    // Upload
    uploadToHuggingFace(outputPath, model.name);

    // Clean up local file to save disk space
    fs.unlinkSync(outputPath);
    console.log(`✓ Removed local file ${model.name}\n`);
  }

  console.log('='.repeat(60));
  console.log('✓ All models uploaded!');
  console.log(`\nRepo: https://huggingface.co/${HF_REPO}`);
  console.log('\nDownload URLs for your app:');
  for (const model of MODELS) {
    console.log(`  https://huggingface.co/${HF_REPO}/resolve/main/${model.name}`);
  }
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('\n✗ Fatal error:', err.message);
  process.exit(1);
});
