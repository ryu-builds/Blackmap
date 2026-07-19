import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execFileAsync = promisify(execFile);

/** Validate a GitHub URL: must be github.com/owner/repo with safe chars. */
export function validateGithubUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") {
      return { valid: false, error: "Only github.com URLs are supported" };
    }
    const parts = parsed.pathname.replace(/^\//, "").split("/").filter(Boolean);
    if (parts.length < 2) {
      return { valid: false, error: "URL must be in format https://github.com/owner/repo" };
    }
    const [owner, repo] = parts;
    const repoName = repo.replace(/\.git$/, "");
    for (const part of [owner, repoName]) {
      if (!/^[a-zA-Z0-9._-]+$/.test(part)) {
        return { valid: false, error: "Invalid characters in repository owner or name" };
      }
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

/**
 * Shallow-clone a public GitHub repository into a temporary directory.
 * Returns the temp dir path. Caller is responsible for cleanup.
 */
export async function cloneRepository(
  url: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), "blackmap-clone-"));
  onProgress?.("Cloning repository (shallow, depth=1)...");

  try {
    await execFileAsync(
      "git",
      ["clone", "--depth", "1", "--single-branch", "--no-tags", url, tmpDir],
      { timeout: 120_000 }
    );
    onProgress?.("Clone complete.");
    return tmpDir;
  } catch (err: any) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    // Surface the last few lines of git's stderr
    const stderr = err.stderr ? String(err.stderr).split("\n").filter(Boolean).slice(-3).join(" ").trim() : "";
    throw new Error(`Clone failed: ${stderr || err.message}`);
  }
}
