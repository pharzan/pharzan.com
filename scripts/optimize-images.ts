#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run

/**
 * Optimizes images in the assets directory
 * Uses sips on macOS or ImageMagick on Linux
 */

import { walk } from "https://deno.land/std@0.224.0/fs/mod.ts";

const ASSETS_DIR = "./assets";
const MAX_WIDTH = 1200; // Max width for images (good for retina displays)
const QUALITY = 85; // JPEG quality (1-100)

// Image extensions to optimize
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"];

async function checkCommand(cmd: string): Promise<boolean> {
  try {
    const process = new Deno.Command(cmd, {
      args: ["--version"],
      stdout: "null",
      stderr: "null",
    });
    const { success } = await process.output();
    return success;
  } catch {
    return false;
  }
}

async function getImageDimensions(
  filePath: string,
): Promise<{ width: number; height: number }> {
  const process = new Deno.Command("sips", {
    args: ["-g", "pixelWidth", "-g", "pixelHeight", filePath],
    stdout: "piped",
    stderr: "piped",
  });

  const { success, stdout, stderr } = await process.output();

  if (!success) {
    const errorText = new TextDecoder().decode(stderr).trim();
    throw new Error(`Failed to read dimensions for ${filePath}: ${errorText}`);
  }

  const output = new TextDecoder().decode(stdout);

  const widthMatch = output.match(/pixelWidth: (\d+)/);
  const heightMatch = output.match(/pixelHeight: (\d+)/);

  return {
    width: widthMatch ? parseInt(widthMatch[1]) : 0,
    height: heightMatch ? parseInt(heightMatch[1]) : 0,
  };
}

async function optimizeWithSips(filePath: string): Promise<void> {
  const dimensions = await getImageDimensions(filePath);

  // Skip if image is already smaller than MAX_WIDTH
  if (dimensions.width <= MAX_WIDTH && dimensions.height <= MAX_WIDTH) {
    console.log(
      `  Skipping ${filePath} (already optimized: ${dimensions.width}x${dimensions.height})`,
    );
    return;
  }

  console.log(
    `  Resizing ${filePath} from ${dimensions.width}x${dimensions.height}...`,
  );

  const process = new Deno.Command("sips", {
    args: ["-Z", MAX_WIDTH.toString(), filePath],
    stdout: "piped",
    stderr: "piped",
  });

  const { success, stderr } = await process.output();

  if (!success) {
    const errorText = new TextDecoder().decode(stderr).trim();
    throw new Error(`Failed to optimize ${filePath}: ${errorText}`);
  }
}

async function optimizeWithImageMagick(filePath: string): Promise<void> {
  console.log(`Optimizing ${filePath} with ImageMagick...`);

  const process = new Deno.Command("convert", {
    args: [
      filePath,
      "-resize",
      `${MAX_WIDTH}>`, // Only resize if larger than MAX_WIDTH
      "-quality",
      QUALITY.toString(),
      filePath,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const { success, stderr } = await process.output();

  if (!success) {
    const errorText = new TextDecoder().decode(stderr).trim();
    throw new Error(`Failed to optimize ${filePath}: ${errorText}`);
  }
}

async function getFileSize(filePath: string): Promise<number> {
  const stat = await Deno.stat(filePath);
  return stat.size;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

async function main() {
  console.log("🖼️  Starting image optimization...\n");

  // Check which tool is available
  const hasSips = await checkCommand("sips");
  const hasImageMagick = await checkCommand("convert");

  if (!hasSips && !hasImageMagick) {
    console.error("❌ No image optimization tool found!");
    console.error("Please install either:");
    console.error("  - sips (built-in on macOS)");
    console.error(
      "  - ImageMagick: brew install imagemagick (macOS) or apt-get install imagemagick (Linux)",
    );
    Deno.exit(1);
  }

  const optimizeFn = hasSips ? optimizeWithSips : optimizeWithImageMagick;
  const toolName = hasSips ? "sips" : "ImageMagick";
  console.log(`Using ${toolName} for optimization\n`);

  let totalOriginalSize = 0;
  let totalOptimizedSize = 0;
  let fileCount = 0;
  let skippedCount = 0;

  // Find and optimize all images
  for await (
    const entry of walk(ASSETS_DIR, {
      exts: IMAGE_EXTENSIONS.map((e) => e.slice(1)),
    })
  ) {
    if (entry.isFile) {
      const originalSize = await getFileSize(entry.path);
      await optimizeFn(entry.path);
      const optimizedSize = await getFileSize(entry.path);

      if (originalSize === optimizedSize) {
        skippedCount++;
      } else {
        const savings = originalSize - optimizedSize;
        const savingsPercent = ((savings / originalSize) * 100).toFixed(1);
        console.log(
          `  ${formatBytes(originalSize)} → ${
            formatBytes(optimizedSize)
          } (${savingsPercent}% saved)`,
        );

        totalOriginalSize += originalSize;
        totalOptimizedSize += optimizedSize;
        fileCount++;
      }
    }
  }

  if (fileCount === 0 && skippedCount === 0) {
    console.log("No images found.");
    return;
  }

  if (fileCount === 0) {
    console.log("\n✅ All images are already optimized!");
    console.log(`🖼️  Files checked: ${skippedCount}`);
    return;
  }

  const totalSavings = totalOriginalSize - totalOptimizedSize;
  const totalSavingsPercent = ((totalSavings / totalOriginalSize) * 100)
    .toFixed(1);

  console.log("\n✅ Optimization complete!");
  console.log(
    `📊 Total: ${formatBytes(totalOriginalSize)} → ${
      formatBytes(totalOptimizedSize)
    }`,
  );
  console.log(
    `💾 Saved: ${formatBytes(totalSavings)} (${totalSavingsPercent}%)`,
  );
  console.log(`🖼️  Files optimized: ${fileCount}`);
  if (skippedCount > 0) {
    console.log(`⏭️  Files skipped: ${skippedCount}`);
  }
}

if (import.meta.main) {
  await main();
}
