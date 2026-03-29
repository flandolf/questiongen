#!/usr/bin/env bun

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

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
  type: 'major' | 'minor' | 'patch'
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
  }
}

function setVersion(version: Version): void {
  const versionStr = formatVersion(version);
  updatePackageJson(versionStr);
  updateCargoToml(versionStr);
  updateTauriConfJson(versionStr);
  updateSettingsView(versionStr);
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function writeJson(path: string, data: any): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function updatePackageJson(version: string): void {
  const pkg = readJson(join(rootDir, 'package.json'));
  pkg.version = version;
  writeJson(join(rootDir, 'package.json'), pkg);
  console.log(`package.json: ${pkg.version}`);
}

function updateCargoToml(version: string): void {
  const content = readFileSync(
    join(rootDir, 'src-tauri', 'Cargo.toml'),
    'utf-8'
  );
  const updated = content.replace(
    /^version = "[\d.]+"$/m,
    `version = "${version}"`
  );
  writeFileSync(join(rootDir, 'src-tauri', 'Cargo.toml'), updated, 'utf-8');
  console.log(`src-tauri/Cargo.toml: ${version}`);
}

function updateTauriConfJson(version: string): void {
  const conf = readJson(join(rootDir, 'src-tauri', 'tauri.conf.json'));
  conf.version = version;
  writeJson(join(rootDir, 'src-tauri', 'tauri.conf.json'), conf);
  console.log(`src-tauri/tauri.conf.json: ${version}`);
}

function updateSettingsView(version: string): void {
  const content = readFileSync(
    join(rootDir, 'src', 'views', 'settings', 'types.ts'),
    'utf-8'
  );
  const updated = content.replace(
    /export const APP_VERSION = "[\d.]+";/,
    `export const APP_VERSION = "${version}";`
  );
  writeFileSync(
    join(rootDir, 'src', 'views', 'settings', 'types.ts'),
    updated,
    'utf-8'
  );
  console.log(`src/views/settings/types.ts: ${version}`);
}

const args = process.argv.slice(2);
const bumpType = (args[0] as 'major' | 'minor' | 'patch') || 'patch';

const currentPkg = readJson(join(rootDir, 'package.json'));
const current = parseVersion(currentPkg.version);
const next = bumpVersion(current, bumpType);
const versionStr = formatVersion(next);

console.log(`Bumping version: ${formatVersion(current)} → ${versionStr}\n`);

setVersion(next);

console.log('\nVersion updated successfully.');
