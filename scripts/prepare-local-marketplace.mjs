import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const pluginName = "codex-project-context";
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const marketplaceRoot = resolve(repositoryRoot, ".local-marketplace");
const pluginTarget = resolve(marketplaceRoot, "plugins", pluginName);
const expectedPrefix = `${marketplaceRoot}${sep}`;

if (!pluginTarget.startsWith(expectedPrefix)) {
  throw new Error("Refusing to package outside .local-marketplace.");
}

const skillRoot = resolve(repositoryRoot, "skills");
const skillEntries = [];
for (const entry of await readdir(skillRoot, { withFileTypes: true })) {
  const source = resolve(skillRoot, entry.name);
  if (entry.isDirectory()) {
    const skill = await stat(resolve(source, "SKILL.md")).catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!skill?.isFile()) {
      if (await containsFiles(source)) throw new Error(`Nonempty skill directory has no SKILL.md: ${entry.name}`);
      continue;
    }
  }
  skillEntries.push(entry.name);
}

await rm(pluginTarget, { recursive: true, force: true });
await mkdir(pluginTarget, { recursive: true });

for (const path of [
  ".codex-plugin",
  "dist",
  "hooks",
  "schemas",
  "CHANGELOG.zh-CN.md",
  "package.json",
  "README.md",
]) {
  await cp(resolve(repositoryRoot, path), resolve(pluginTarget, path), { recursive: true });
}
await mkdir(resolve(pluginTarget, "skills"), { recursive: true });
for (const name of skillEntries) {
  await cp(resolve(skillRoot, name), resolve(pluginTarget, "skills", name), { recursive: true });
}

const manifest = JSON.parse(
  await readFile(resolve(repositoryRoot, ".codex-plugin", "plugin.json"), "utf8"),
);

const marketplace = {
  name: "codex-project-context-dev",
  interface: {
    displayName: "Codex Project Context Development",
  },
  plugins: [
    {
      name: pluginName,
      source: {
        source: "local",
        path: `./plugins/${pluginName}`,
      },
      policy: {
        installation: "AVAILABLE",
        authentication: "ON_INSTALL",
      },
      category: manifest.interface.category,
    },
  ],
};

const marketplacePath = join(marketplaceRoot, ".agents", "plugins", "marketplace.json");
await mkdir(dirname(marketplacePath), { recursive: true });
await writeFile(marketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`, "utf8");
process.stdout.write(`${marketplaceRoot}\n`);

async function containsFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || await containsFiles(resolve(directory, entry.name))) return true;
  }
  return false;
}
