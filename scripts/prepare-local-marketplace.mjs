import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

await rm(pluginTarget, { recursive: true, force: true });
await mkdir(pluginTarget, { recursive: true });

for (const path of [
  ".codex-plugin",
  "dist",
  "hooks",
  "schemas",
  "skills",
  "CHANGELOG.zh-CN.md",
  "package.json",
  "README.md",
]) {
  await cp(resolve(repositoryRoot, path), resolve(pluginTarget, path), { recursive: true });
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
