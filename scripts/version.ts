#!/usr/bin/env bun

declare const Bun: {
  argv: string[];
  file(path: string | URL): {
    text(): Promise<string>;
    json(): Promise<unknown>;
  };
  write(path: string | URL, data: string): Promise<number>;
};

const rootDir = new URL('../', import.meta.url);

function fromRoot(...segments: string[]): URL {
  return new URL(segments.join('/'), rootDir);
}

interface Version {
  major: number;
  minor: number;
  patch: number;
}

function parseVersion(str: string): Version {
  const parts = str.split('.').map(Number);
  return { major: parts[0] ?? 0, minor: parts[1] ?? 0, patch: parts[2] ?? 0 };
}

function formatVersion(v: Version): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

function bumpVersion(
  current: Version,
  type: 'major' | 'minor' | 'patch' | 'custom',
  customVersion?: string,
): Version {
  switch (type) {
    case 'major':
      return { major: current.major + 1, minor: 0, patch: 0 };
    case 'minor':
      return { major: current.major, minor: current.minor + 1, patch: 0 };
    case 'patch':
      return {
        major: current.major,
        minor: current.minor,
        patch: current.patch + 1,
      };
    case 'custom':
      if (!customVersion) {
        throw new Error('Custom version not provided');
      }
      return parseVersion(customVersion);
    default:
      throw new Error(`Unknown bump type: ${type}`);
  }
}

async function readJson<T>(path: string | URL): Promise<T> {
  return (await Bun.file(path).json()) as T;
}

async function writeJson(path: string | URL, data: unknown): Promise<void> {
  await Bun.write(path, JSON.stringify(data, null, 2) + '\n');
}

interface PackageJson {
  version: string;
  [key: string]: unknown;
}

async function updatePackageJson(version: string): Promise<void> {
  const packageJsonPath = fromRoot('package.json');
  const pkg = await readJson<PackageJson>(packageJsonPath);
  pkg.version = version;
  await writeJson(packageJsonPath, pkg);
  console.log(`package.json: ${pkg.version}`);
}

async function updateCargoToml(version: string): Promise<void> {
  const cargoTomlPath = fromRoot('src-tauri', 'Cargo.toml');
  const content = await Bun.file(cargoTomlPath).text();
  const updated = content.replace(
    /^version = "[\d.]+"$/m,
    `version = "${version}"`,
  );
  await Bun.write(cargoTomlPath, updated);
  console.log(`src-tauri/Cargo.toml: ${version}`);
}

interface TauriConfig {
  version: string;
  [key: string]: unknown;
}

async function updateTauriConfJson(version: string): Promise<void> {
  const tauriConfigPath = fromRoot('src-tauri', 'tauri.conf.json');
  const conf = await readJson<TauriConfig>(tauriConfigPath);
  conf.version = version;
  await writeJson(tauriConfigPath, conf);
  console.log(`src-tauri/tauri.conf.json: ${version}`);
}

async function updateSettingsView(version: string): Promise<void> {
  const settingsPath = fromRoot('src', 'views', 'settings', 'types.ts');
  const content = await Bun.file(settingsPath).text();
  const updated = content.replace(
    /export const APP_VERSION = '[\d.]+';/,
    `export const APP_VERSION = '${version}';`,
  );
  await Bun.write(settingsPath, updated);
  console.log(`src/views/settings/types.ts: ${version}`);
}

async function main(): Promise<void> {
  const args = Bun.argv.slice(2);
  const bumpType =
    (args[0] as 'major' | 'minor' | 'patch' | 'custom') || 'patch';
  const customVersion = args[1];

  const currentPkg = await readJson<PackageJson>(fromRoot('package.json'));
  const current = parseVersion(currentPkg.version);
  const next = bumpVersion(current, bumpType, customVersion);
  const versionStr = formatVersion(next);

  console.log(`Bumping version: ${formatVersion(current)} → ${versionStr}\n`);

  await updatePackageJson(versionStr);
  await updateCargoToml(versionStr);
  await updateTauriConfJson(versionStr);
  await updateSettingsView(versionStr);

  console.log('\nVersion updated successfully.');
}

main();
