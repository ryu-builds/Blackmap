/**
 * Local embedding provider — pure JavaScript, zero external dependencies.
 *
 * Strategy: Random Indexing with camelCase-aware tokenisation.
 * Each token is mapped to a 384-dimensional sparse vector using two stable
 * hash functions (FNV-1a + Murmur-inspired). Vectors are summed and
 * L2-normalised. This is deterministic, fast, works offline, and captures
 * token identity effectively for code search.
 *
 * Quality: Not as good as a trained model, but correct and consistent.
 * Users who want semantic accuracy should configure OpenAI or Gemini.
 */
import type { EmbeddingProvider } from "./base.js";

const DIMS = 384;

// ---------------------------------------------------------------------------
// Fast stable hash — FNV-1a variant (32-bit, fits JS number safely)
// ---------------------------------------------------------------------------
function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // keep unsigned 32-bit
  }
  return hash;
}

// Second independent hash derived from Murmur-inspired mix
function hash2(str: string): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x85ebca6b);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Tokeniser: split on whitespace, punctuation, and camelCase boundaries
// ---------------------------------------------------------------------------
const SPLIT_RE = /[\s\x00-\x1f\x7f!@#$%^&*()\-+=[\]{};:'",.<>/?\\|`~]+/;

function tokenise(text: string): string[] {
  const tokens: string[] = [];
  for (const raw of text.split(SPLIT_RE)) {
    if (!raw) continue;
    // Split camelCase and PascalCase: "getUserById" → ["get","User","By","Id"]
    const parts = raw
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .split(" ");
    for (const p of parts) {
      const t = p.toLowerCase();
      if (t.length >= 2) tokens.push(t); // skip single-char tokens
    }
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Embed a single text string into DIMS dimensions
// ---------------------------------------------------------------------------
function embedText(text: string): number[] {
  const vec = new Float64Array(DIMS);
  const tokens = tokenise(text);
  if (tokens.length === 0) return Array.from(vec);

  for (const token of tokens) {
    const h1 = fnv1a(token);
    const h2 = hash2(token);
    // Each token writes to 6 dimensions for better coverage
    for (let k = 0; k < 6; k++) {
      const idx = (h1 + k * h2) % DIMS;
      const sign = (fnv1a(token + k) & 1) === 0 ? 1 : -1;
      vec[idx] += sign;
    }
  }

  // L2 normalise
  let norm = 0;
  for (let i = 0; i < DIMS; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return Array.from(vec);
  return Array.from(vec).map((v) => v / norm);
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly id = "local";
  readonly name = "Local (hash-based, no API key)";
  readonly dimensions = DIMS;

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(embedText);
  }

  async embed(text: string): Promise<number[]> {
    return embedText(text);
  }
}
