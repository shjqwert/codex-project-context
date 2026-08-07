import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";

const directories = new Set();

after(async () => {
  for (const directory of directories) {
    await rm(directory, { recursive: true, force: true });
  }
  directories.clear();
});

export async function makeTempDirectory(prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  directories.add(directory);
  return directory;
}
