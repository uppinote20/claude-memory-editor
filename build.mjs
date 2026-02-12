import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2]; // 'server', 'frontend', or undefined (both)

const serverConfig = {
  entryPoints: [resolve(__dirname, 'scripts/server.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: resolve(__dirname, 'dist/server.js'),
  banner: { js: '#!/usr/bin/env node' },
  external: [],
  minify: false,
};

const frontendConfig = {
  entryPoints: [resolve(__dirname, 'scripts/frontend/app.ts')],
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  outfile: resolve(__dirname, 'dist/frontend/assets/app.js'),
  minify: true,
};

function copyStaticFiles() {
  const frontendDir = resolve(__dirname, 'scripts/frontend');
  const distFrontendDir = resolve(__dirname, 'dist/frontend');
  const assetsDir = resolve(distFrontendDir, 'assets');

  mkdirSync(distFrontendDir, { recursive: true });
  mkdirSync(assetsDir, { recursive: true });

  // Copy HTML to dist/frontend/
  copyFileSync(resolve(frontendDir, 'index.html'), resolve(distFrontendDir, 'index.html'));

  // Copy CSS to dist/frontend/assets/
  copyFileSync(resolve(frontendDir, 'styles.css'), resolve(assetsDir, 'styles.css'));

  console.log('Static files copied → dist/frontend/');
}

function syncVersions() {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
  const version = pkg.version;

  const pluginPath = resolve(__dirname, '.claude-plugin/plugin.json');
  const pluginJson = JSON.parse(readFileSync(pluginPath, 'utf-8'));
  pluginJson.version = version;
  writeFileSync(pluginPath, JSON.stringify(pluginJson, null, 2) + '\n');

  const marketplacePath = resolve(__dirname, '.claude-plugin/marketplace.json');
  const marketplaceJson = JSON.parse(readFileSync(marketplacePath, 'utf-8'));
  marketplaceJson.version = version;
  if (marketplaceJson.metadata) {
    marketplaceJson.metadata.version = version;
  }
  writeFileSync(marketplacePath, JSON.stringify(marketplaceJson, null, 2) + '\n');

  console.log(`Version ${version} synced → plugin.json, marketplace.json`);
}

async function build() {
  syncVersions();

  if (!target || target === 'server') {
    await esbuild.build(serverConfig);
    console.log('Server built → dist/server.js');
  }
  if (!target || target === 'frontend') {
    await esbuild.build(frontendConfig);
    copyStaticFiles();
    console.log('Frontend built → dist/frontend/');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
