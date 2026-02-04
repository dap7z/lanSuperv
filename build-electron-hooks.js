/**
 * Electron Builder Hooks
 * Prevents native module rebuilding for Electron
 * The server uses system Node.js, not Electron, so native modules should not be rebuilt
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  
  // Generate app-update.yml for electron-updater
  // This file must be in the resources directory of the packaged app
  console.log('[BUILD-HOOK] Generating app-update.yml for electron-updater...');
  generateAppUpdateYml(context);
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

/**
 * Generate app-update.yml file in the resources directory
 * This file is required by electron-updater to check for updates
 * It should point to the latest.yml file on the update server (GitHub releases)
 */
function generateAppUpdateYml(context) {
  const appOutDir = context.appOutDir;
  const resourcesDir = path.join(appOutDir, 'resources');
  
  // Ensure resources directory exists
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
  }
  
  // Get configuration
  const electronBuilderConfig = require('./electron-builder.json');
  const packageJson = require('./package.json');
  const version = packageJson.version;
  const productName = electronBuilderConfig.productName || packageJson.productName || 'lanSuperv';
  
  // Get publish configuration
  const publishConfig = electronBuilderConfig.publish || {};
  const owner = publishConfig.owner || 'dap7z';
  const repo = publishConfig.repo || 'lanSuperv';
  
  // Generate app-update.yml content
  // This file tells electron-updater where to find the update information
  // The URL points to latest.yml on GitHub releases
  const updateUrl = `https://github.com/${owner}/${repo}/releases/latest/download/latest.yml`;
  
  // updaterCacheDirName is required by electron-updater
  // This specifies the cache directory name for the updater
  const updaterCacheDirName = `${productName}-updater`;
  
  const yamlContent = `version: ${version}
releaseDate: '${new Date().toISOString()}'
updateUrl: ${updateUrl}
updaterCacheDirName: ${updaterCacheDirName}
`;
  
  // Write app-update.yml to resources directory
  const appUpdateYmlPath = path.join(resourcesDir, 'app-update.yml');
  fs.writeFileSync(appUpdateYmlPath, yamlContent, 'utf8');
  
  console.log('[BUILD-HOOK] ✅ Generated app-update.yml at: ' + appUpdateYmlPath);
  console.log('[BUILD-HOOK]   - Version: ' + version);
  console.log('[BUILD-HOOK]   - Update URL: ' + updateUrl);
}

/**
 * Generate latest.yml file for electron-updater
 * This is needed when using zip format which doesn't auto-generate update files
 * (Unfortunately "generateUpdatesFilesForAllChannels": true is not enough)
 */
exports.afterAllArtifactBuild = async (context) => {
  console.log('[BUILD-HOOK] afterAllArtifactBuild: Generating latest.yml for updates');
  
  const outputDir = context.outDir || path.join(__dirname, 'dist-electron');
  
  // Get configuration from electron-builder.json
  const electronBuilderConfig = require('./electron-builder.json');
  const packageJson = require('./package.json');
  const version = packageJson.version;
  const productName = electronBuilderConfig.productName || packageJson.productName || 'lanSuperv';
  
  // Find Windows zip file (electron-builder format: {productName}-{version}-win-x64.zip)
  const files = fs.readdirSync(outputDir);
  // Try exact match first
  let zipFile = files.find(f => f.toLowerCase() === `${productName}-${version}-win-x64.zip`.toLowerCase());
  
  // If not found, try pattern matching
  if (!zipFile) {
    const zipPattern = new RegExp(`^${productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-${version.replace(/\./g, '\\.')}-win-x64\\.zip$`, 'i');
    zipFile = files.find(f => zipPattern.test(f));
  }
  
  // If still not found, try any zip file with win in the name
  if (!zipFile) {
    zipFile = files.find(f => f.endsWith('.zip') && f.toLowerCase().includes('win'));
  }
  
  if (!zipFile) {
    console.log('[BUILD-HOOK] ⚠️ No Windows zip file found, skipping latest.yml generation');
    console.log('[BUILD-HOOK] Available files: ' + files.join(', '));
    return;
  }
  
  const zipPath = path.join(outputDir, zipFile);
  console.log('[BUILD-HOOK] Found zip file: ' + zipFile);
  
  // Calculate SHA512 hash
  console.log('[BUILD-HOOK] Calculating SHA512 hash...');
  const fileBuffer = fs.readFileSync(zipPath);
  const hashSum = crypto.createHash('sha512');
  hashSum.update(fileBuffer);
  const sha512 = hashSum.digest('base64');
  
  // Get file size
  const stats = fs.statSync(zipPath);
  const size = stats.size;
  
  // Generate latest.yml content (YAML format)
  const releaseDate = new Date().toISOString();
  const yamlContent = `version: ${version}
files:
  - url: ${zipFile}
    sha512: ${sha512}
    size: ${size}
path: ${zipFile}
sha512: ${sha512}
releaseDate: '${releaseDate}'
`;
  
  // Write latest.yml file
  const latestYmlPath = path.join(outputDir, 'latest.yml');
  fs.writeFileSync(latestYmlPath, yamlContent, 'utf8');
  
  console.log('[BUILD-HOOK] ✅ Generated latest.yml at: ' + latestYmlPath);
  console.log('[BUILD-HOOK]   - Version: ' + version);
  console.log('[BUILD-HOOK]   - File: ' + zipFile);
  console.log('[BUILD-HOOK]   - Size: ' + size + ' bytes');
  console.log('[BUILD-HOOK]   - SHA512: ' + sha512.substring(0, 20) + '...');
};

/**
 * Add latest.yml to the list of artifacts to publish
 * This hook is called for each artifact built
 * We need to manually add latest.yml to the publish list
 */
exports.artifactBuildCompleted = async (context) => {
  // Only process Windows zip artifacts
  if (context.platformName !== 'win' || !context.arch || context.arch !== 'x64') {
    return;
  }
  
  // Check if this is a zip artifact
  const artifactPath = context.artifactPath;
  if (!artifactPath || !artifactPath.endsWith('.zip')) {
    return;
  }
  
  console.log('[BUILD-HOOK] artifactBuildCompleted: Processing Windows zip artifact');
  
  const outputDir = context.outDir || path.join(__dirname, 'dist-electron');
  const latestYmlPath = path.join(outputDir, 'latest.yml');
  
  // Check if latest.yml exists (should have been created by afterAllArtifactBuild)
  if (!fs.existsSync(latestYmlPath)) {
    console.log('[BUILD-HOOK] ⚠️ latest.yml not found, generating it now...');
    // Generate it if it doesn't exist
    await exports.afterAllArtifactBuild(context);
  }
  
  if (fs.existsSync(latestYmlPath)) {
    // electron-builder doesn't automatically publish files generated by hooks
    // We need to add it manually to the artifacts list
    // The file is in the output directory, so it should be picked up
    // But we need to ensure it's in the same directory structure
    console.log('[BUILD-HOOK] ✅ latest.yml exists and should be published with: ' + path.basename(artifactPath));
    console.log('[BUILD-HOOK] ⚠️ Note: electron-builder may not automatically publish latest.yml');
    console.log('[BUILD-HOOK] ⚠️ You may need to upload it manually or use a post-publish script');
  }
};
