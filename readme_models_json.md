# models.json — Remote Model Catalog Specification

> **This file is meant to be read by an AI assistant** working on the `local_models` repo.
> It describes how to generate and maintain the `models.json` manifest that the Local AI Android app fetches at startup.

---

## What is models.json

`models.json` is a JSON manifest hosted at the root of the `local_models` repo (branch `main`).
The Local AI Android app fetches it from:
```
https://raw.githubusercontent.com/Fabrizio1990/local_models/main/models.json
```

It contains the **full catalog** of all available AI models. The app then filters this list locally using an `ENABLED_MODEL_IDS` array to decide which models to show to the user.

---

## Schema

```json
{
  "models": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "size": "string",
      "minRamGB": number,
      "maxTokensByRam": { "low": number, "normal": number, "high": number },
      "downloadUrl": "string",
      "fileName": "string",
      "format": "gguf" | "litertlm",
      "isMultiPart": boolean,
      "parts": ["string"]
    }
  ]
}
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique lowercase ID. Convention: `{model}-{size}-{quant}` (e.g. `qwen3.5-0.8b-q4km`) |
| `name` | Yes | Human-readable display name (e.g. `Qwen 3.5 0.8B`) |
| `description` | Yes | Short English description of the model |
| `size` | Yes | Human-readable file size (e.g. `533 MB`, `2.74 GB`) |
| `minRamGB` | Yes | Minimum device RAM in GB required to run the model |
| `maxTokensByRam` | Yes | Context window (tokens) per RAM tier. See calculation below |
| `downloadUrl` | Yes | Direct URL to the model file. For multi-part: URL of `.part1` |
| `fileName` | Yes | Final file name after merge (no `.partN` suffix) |
| `format` | Yes | `"gguf"` for llama.cpp models, `"litertlm"` for MediaPipe models |
| `isMultiPart` | Only if split | `true` if the model file is split into multiple parts |
| `parts` | Only if split | Array of part filenames in order (e.g. `["model.part1.gguf", "model.part2.gguf"]`) |

---

## Download URLs

All model files are hosted as GitHub Releases assets in this repo.

**URL format:**
```
https://github.com/Fabrizio1990/local_models/releases/download/{tag}/{filename}
```

**Tag conventions:**
- MediaPipe models (`.litertlm`): `v1.0.0-models`
- GGUF models (`.gguf`): `v2.0.0-models` (increment as needed)

**Multi-part files:**
GitHub Releases has a 2 GB per-file limit. Files larger than 2 GB must be split:
```bash
split -b 1900m model.gguf model.part
# Produces: model.partaa, model.partab, ...
# Rename to: model.part1.gguf, model.part2.gguf, ...
```

When `isMultiPart: true`:
- `downloadUrl` points to the `.part1` file
- `fileName` is the final merged name (without `.partN`)
- `parts` lists all part filenames in order
- The app downloads all parts and merges them automatically

---

## maxTokensByRam Calculation

The app selects the context window based on device RAM:
- **low**: device has < 4 GB RAM
- **normal**: device has 4-8 GB RAM
- **high**: device has > 8 GB RAM

### How to calculate maxTokensByRam

The key constraint is: **model weights + KV cache must fit in available RAM**.

**Formula:**
```
available_for_kv = device_ram * 0.5 - model_weight_gb
kv_per_token ≈ 2 * n_layers * d_model * 2 bytes (key + value, FP16)
max_tokens = available_for_kv / kv_per_token
```

**Simplified rules of thumb for Q4_K_M GGUF models:**

| Model weight | KV cache per 1K tokens | low (<4GB) | normal (4-8GB) | high (>8GB) |
|-------------|----------------------|------------|----------------|-------------|
| < 600 MB | ~15 MB | 4096 | 8192 | 16384 |
| 600 MB - 1.5 GB | ~30 MB | 2048 | 4096 | 8192 |
| 1.5 - 3 GB | ~60 MB | 2048 | 4096 | 6144 |
| 3 - 6 GB | ~120 MB | 2048 | 2048 | 4096 |
| > 6 GB | ~200 MB+ | 2048 | 2048 | 2048 |

**Key principles:**
1. Small models (< 1B params) → can afford large context even on low RAM
2. Large models (> 4B params) → keep context conservative, the weights already use most RAM
3. The `low` tier should never exceed 4096 (these devices have very little headroom)
4. The `high` tier should never exceed 16384 (diminishing returns + latency increases)
5. When in doubt, be conservative — an OOM crash is worse than a smaller context
6. All values must be powers of 2 or multiples of 1024 (e.g. 2048, 4096, 6144, 8192, 16384)

**For MediaPipe (.litertlm) models:**
MediaPipe has its own internal limits. Use conservative values:
- low: 2048, normal: 4096, high: 4096 (for small models)
- low: 2048, normal: 4096, high: 8192 (for large models)

---

## Example: Adding a New Model

Say you want to add `Phi-3-mini-4k` (3.8B params, Q4_K_M, 2.3 GB GGUF):

1. **Upload** the GGUF file(s) to a GitHub Release (split if > 2GB)
2. **Calculate maxTokensByRam:**
   - Weight: 2.3 GB → falls in "1.5 - 3 GB" range
   - low: 2048, normal: 4096, high: 6144
3. **Determine minRamGB:**
   - Model weight (2.3 GB) + OS overhead (~1.5 GB) + minimal KV cache (~0.2 GB) = ~4 GB minimum
   - `minRamGB: 4`
4. **Add to models.json:**

```json
{
  "id": "phi3-mini-4k-q4km",
  "name": "Phi-3 Mini 4K",
  "description": "Microsoft Phi-3 Mini with Q4_K_M quantization for on-device inference via llama.cpp",
  "size": "2.3 GB",
  "minRamGB": 4,
  "maxTokensByRam": { "low": 2048, "normal": 4096, "high": 6144 },
  "downloadUrl": "https://github.com/Fabrizio1990/local_models/releases/download/v2.0.0-models/Phi-3-mini-4k-Q4_K_M.part1.gguf",
  "fileName": "Phi-3-mini-4k-Q4_K_M.gguf",
  "format": "gguf",
  "isMultiPart": true,
  "parts": [
    "Phi-3-mini-4k-Q4_K_M.part1.gguf",
    "Phi-3-mini-4k-Q4_K_M.part2.gguf"
  ]
}
```

---

## minRamGB Calculation

Simple rule:
| Model file size | minRamGB |
|----------------|----------|
| < 700 MB | 2 |
| 700 MB - 2 GB | 4 |
| 2 - 4 GB | 6 |
| 4 - 6 GB | 8 |
| > 6 GB | 10 |

This accounts for: model weights + OS/app overhead + minimal KV cache.

---

## ID Convention

Format: `{model_family}{version}-{param_count}-{quantization}`

Examples:
- `qwen3.5-0.8b-q4km` → Qwen 3.5, 0.8B params, Q4_K_M
- `phi3-mini-4k-q4km` → Phi-3 Mini 4K, Q4_K_M
- `gemma3-1b-it` → Gemma 3 1B IT (no quant suffix for non-GGUF)

Rules:
- All lowercase
- Use dots for version numbers (`3.5`, not `35`)
- Use hyphens as separators
- Quantization suffix: `q4km` (Q4_K_M), `q5km` (Q5_K_M), `q8` (Q8_0), etc.

---

## fileName Convention

Use the **original HuggingFace naming** for GGUF files:
- `Qwen3.5-0.8B-Q4_K_M.gguf` (not `qwen3.5-0.8b-q4km.gguf`)

This ensures consistency with the download scripts and avoids renaming.

For multi-part: `Qwen3.5-4B-Q4_K_M.part1.gguf`, `Qwen3.5-4B-Q4_K_M.part2.gguf`, etc.

---

## Validation Checklist

Before committing changes to models.json:
- [ ] Valid JSON (no trailing commas, correct brackets)
- [ ] Every model has all required fields
- [ ] `id` is unique across all models
- [ ] `fileName` matches the actual file uploaded to GitHub Releases
- [ ] `parts` filenames match the actual files uploaded (if multi-part)
- [ ] `downloadUrl` is a valid GitHub Releases URL and the asset exists
- [ ] `maxTokensByRam.low <= maxTokensByRam.normal <= maxTokensByRam.high`
- [ ] `minRamGB` is consistent with model size
- [ ] `format` matches the file extension (`.gguf` → `"gguf"`, `.litertlm` → `"litertlm"`)
