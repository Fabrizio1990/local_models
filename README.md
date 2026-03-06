# Local AI Models

Repository containing AI models for on-device inference on Android.

## Models

### Gemma (MediaPipe / LiteRT) - `v1.0.0-models`
- `gemma3-1b-it-int4.litertlm` - Gemma 3 1B (557 MB)
- `gemma-3n-E2B-it-int4.litertlm` - Gemma 3n E2B (3.2 GB, 2 parts)

### Qwen 3.5 (GGUF / llama.cpp) - `v2.0.0-models`
- `Qwen3.5-0.8B-Q4_K_M.gguf` - Qwen 3.5 0.8B (508 MB)
- `Qwen3.5-2B-Q4_K_M.gguf` - Qwen 3.5 2B (1.19 GB)
- `Qwen3.5-4B-Q4_K_M.gguf` - Qwen 3.5 4B (2.55 GB, 2 parts)
- `Qwen3.5-9B-Q4_K_M.gguf` - Qwen 3.5 9B (5.29 GB, 3 parts)

## Usage

The app reads `models.json` for the model catalog. Download the models from the [Releases](https://github.com/Fabrizio1990/local_models/releases) page.

## Scripts

### Download models from HuggingFace

```bash
# Set your HuggingFace token in .env
echo "HF_TOKEN=your_token_here" > .env

# Download, split, and update models.json
node scripts/download-models.js
```

### Publish to GitHub Releases

Requires [GitHub CLI](https://cli.github.com/) (`brew install gh`).

```bash
# Create the release and upload all model files in one command
gh release create v2.0.0-models \
  --repo Fabrizio1990/local_models \
  --title "Qwen 3.5 GGUF Models" \
  --notes "Qwen 3.5 models (Q4_K_M) for on-device inference via llama.cpp." \
  ./models/*.gguf

# Then commit and push the updated models.json
git add models.json
git commit -m "Update models.json with Qwen 3.5 GGUF models"
git push
```
