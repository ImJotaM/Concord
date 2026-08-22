const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const serverDir = path.join(rootDir, 'server');
const serverDist = path.join(serverDir, 'dist');
const targetDir = path.join(rootDir, 'src-tauri', 'resources', 'server');

console.log('📦 Preparing server bundle for Tauri release...');

// 1. Ensure server is compiled
if (!fs.existsSync(path.join(serverDist, 'server.js'))) {
  console.log('⚙️ Compiling server TypeScript...');
  execSync('npm --prefix server run build', { stdio: 'inherit', cwd: rootDir });
}

// 2. Clean & create target resources directory
if (fs.existsSync(targetDir)) {
  fs.rmSync(targetDir, { recursive: true, force: true });
}
fs.mkdirSync(targetDir, { recursive: true });

// 3. Copy dist
console.log('📁 Copying server dist files...');
fs.cpSync(serverDist, path.join(targetDir, 'dist'), { recursive: true });

// 4. Copy package.json
console.log('📄 Copying package.json...');
fs.copyFileSync(path.join(serverDir, 'package.json'), path.join(targetDir, 'package.json'));

// 5. Copy node_modules (production dependencies)
const nodeModulesSrc = path.join(serverDir, 'node_modules');
if (fs.existsSync(nodeModulesSrc)) {
  console.log('📦 Copying server node_modules...');
  fs.cpSync(nodeModulesSrc, path.join(targetDir, 'node_modules'), { recursive: true });
}

console.log('✅ Tauri server resources prepared successfully at src-tauri/resources/server!\n');
