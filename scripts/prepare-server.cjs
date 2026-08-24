const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const serverDir = path.join(rootDir, 'server');
const serverDist = path.join(serverDir, 'dist');
const targetDir = path.join(rootDir, 'src-tauri', 'resources', 'server');

console.log('Preparing server bundle for Tauri release...');

// 1. Build single bundled server file
console.log('Bundling server with esbuild...');
execSync('npm --prefix server run build', { stdio: 'inherit', cwd: rootDir });

// 2. Clean & recreate target directory
if (fs.existsSync(targetDir)) {
  fs.rmSync(targetDir, { recursive: true, force: true });
}
fs.mkdirSync(targetDir, { recursive: true });

// 3. Force Node to treat this directory as CommonJS
fs.writeFileSync(
  path.join(targetDir, 'package.json'),
  JSON.stringify({ name: 'concord-server-resource', type: 'commonjs' }, null, 2)
);

// 4. Copy server dist bundle
console.log('Copying server dist bundle...');
fs.cpSync(serverDist, path.join(targetDir, 'dist'), { recursive: true });

console.log('Server bundle prepared successfully at src-tauri/resources/server!\n');