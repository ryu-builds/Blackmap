import AdmZip from "adm-zip";
import { mkdtemp, rm } from "fs/promises";
import { join, resolve, normalize, sep } from "path";
import { tmpdir } from "os";

/**
 * Safely extract a ZIP buffer into a new temporary directory.
 * Guards against Zip Slip, oversized archives, and corrupted ZIPs.
 * Caller is responsible for cleanup of the returned directory.
 */
export async function extractZip(
  zipBuffer: Buffer,
  maxSizeMb: number,
  onProgress?: (msg: string) => void
): Promise<string> {
  const maxBytes = maxSizeMb * 1024 * 1024;
  if (zipBuffer.length > maxBytes) {
    throw new Error(`ZIP file size (${(zipBuffer.length / 1024 / 1024).toFixed(1)}MB) exceeds the maximum allowed ${maxSizeMb}MB`);
  }

  const tmpDir = await mkdtemp(join(tmpdir(), "blackmap-zip-"));
  const resolvedBase = resolve(tmpDir);

  onProgress?.("Validating ZIP archive...");

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch (err: any) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(`Invalid or corrupted ZIP file: ${err.message}`);
  }

  const entries = zip.getEntries();

  // Zip Slip prevention: every resolved entry path must be under resolvedBase
  for (const entry of entries) {
    const safePath = resolve(join(resolvedBase, normalize(entry.entryName)));
    // The path must start with the base dir followed by the OS separator (or equal it for root entries)
    if (!safePath.startsWith(resolvedBase + sep) && safePath !== resolvedBase) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      throw new Error(`Unsafe ZIP path detected (Zip Slip): "${entry.entryName}"`);
    }
    // Reject entries that are individually oversized (could be zip-bomb)
    if (entry.header.size > maxBytes) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      throw new Error(
        `ZIP entry "${entry.entryName}" (${(entry.header.size / 1024 / 1024).toFixed(1)}MB) exceeds maximum size of ${maxSizeMb}MB`
      );
    }
  }

  onProgress?.(`Extracting ${entries.length} entries...`);

  try {
    zip.extractAllTo(tmpDir, /* overwrite */ true);
    onProgress?.("Extraction complete.");
    return tmpDir;
  } catch (err: any) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(`Extraction failed: ${err.message}`);
  }
}
