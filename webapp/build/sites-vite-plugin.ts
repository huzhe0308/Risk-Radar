import { access, cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

// Packages Sites metadata and migrations after Vite finishes compiling.
export function sites(): Plugin {
  let root = process.cwd();

  return {
    name: "sites",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      const outputDirectory = resolve(root, "dist", ".openai");
      const hostingConfig = resolve(root, ".openai", "hosting.json");
      const drizzleSource = resolve(root, "drizzle");

      try {
        await rm(outputDirectory, { recursive: true, force: true });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EPERM" && code !== "EBUSY") throw error;
      }
      await mkdir(outputDirectory, { recursive: true });

      const hostingTarget = resolve(outputDirectory, "hosting.json");
      if (await exists(hostingConfig) && !(await exists(hostingTarget))) {
        await cp(hostingConfig, hostingTarget);
      }
      const drizzleTarget = resolve(outputDirectory, "drizzle");
      if (await exists(drizzleSource) && !(await exists(drizzleTarget))) {
        await cp(drizzleSource, drizzleTarget, {
          recursive: true,
        });
      }
    },
  };
}
