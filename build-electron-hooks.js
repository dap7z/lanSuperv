/**
 * Electron Builder Hooks
 * Prevents native module rebuilding for Electron
 * The server uses system Node.js, not Electron, so native modules should not be rebuilt
 */

const fs = require('fs');
const path = require('path');

exports.beforeBuild = async (context) => {
  console.log('[BUILD-HOOK] beforeBuild: Native modules are already compiled for Node.js 24.12.0');
  console.log('[BUILD-HOOK] Skipping rebuild - server uses system Node.js, not Electron');
  // These environment variables should prevent electron-builder from rebuilding
  process.env.npm_config_build_from_source = 'false';
  process.env.npm_config_rebuild = 'false';
  process.env.ELECTRON_SKIP_BINARY_DOWNLOAD = '1';
};

exports.afterPack = async (context) => {
  console.log('[BUILD-HOOK] afterPack: Ensuring native modules are available (asar unpacked)');
  const appOutDir = context.appOutDir;
  
  // With asar enabled, unpacked files are in app.asar.unpacked
  // Path to unpacked node_modules (where asarUnpack places the native modules)
  const asarUnpackedPath = path.join(appOutDir, 'resources', 'app.asar.unpacked');
  const unpackedNodeModules = path.join(asarUnpackedPath, 'node_modules');
  
  // Path to source node_modules with native modules compiled for Node.js
  const sourceNodeModules = path.join(__dirname, 'node_modules');
  
  // Verify that asarUnpack has extracted the native modules
  const rawSocketUnpacked1 = path.join(unpackedNodeModules, '@justjam2013', 'raw-socket', 'build');
  const rawSocketUnpacked2 = path.join(unpackedNodeModules, 'raw-socket', 'build');
  
  console.log('[BUILD-HOOK] Checking unpacked native modules...');
  console.log('[BUILD-HOOK] @justjam2013/raw-socket unpacked: ' + fs.existsSync(rawSocketUnpacked1));
  console.log('[BUILD-HOOK] raw-socket unpacked: ' + fs.existsSync(rawSocketUnpacked2));
  
  // If asarUnpack didn't extract them (shouldn't happen), copy them manually
  const rawSocketSource1 = path.join(sourceNodeModules, '@justjam2013', 'raw-socket');
  if (fs.existsSync(rawSocketSource1) && !fs.existsSync(rawSocketUnpacked1)) {
    console.log('[BUILD-HOOK] ⚠️ @justjam2013/raw-socket not unpacked, copying manually...');
    const buildSource = path.join(rawSocketSource1, 'build');
    if (fs.existsSync(buildSource)) {
      const targetDir = path.dirname(rawSocketUnpacked1);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      copyRecursiveSync(buildSource, rawSocketUnpacked1);
      console.log('[BUILD-HOOK] ✅ @justjam2013/raw-socket native module copied');
    }
  }
  
  if (fs.existsSync(rawSocketSource1) && !fs.existsSync(rawSocketUnpacked2)) {
    console.log('[BUILD-HOOK] ⚠️ raw-socket not unpacked, copying manually...');
    const buildSource = path.join(rawSocketSource1, 'build');
    if (fs.existsSync(buildSource)) {
      const targetDir = path.dirname(rawSocketUnpacked2);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      copyRecursiveSync(buildSource, rawSocketUnpacked2);
      console.log('[BUILD-HOOK] ✅ raw-socket native module copied');
    }
  }
  
  console.log('[BUILD-HOOK] ✅ Native modules verification complete');
};

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}
