#!/usr/bin/env node
/**
 * Build script for Node.js SEA (Single Executable Applications)
 * Compatible with Node.js 24+
 * 
 * Usage: node build-sea.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔨 Build with Node.js SEA (Single Executable Applications)');
console.log('========================================================\n');

// Check Node.js version
const nodeVersion = process.version;
console.log(`📦 Node.js version: ${nodeVersion}`);

if (!nodeVersion.startsWith('v24')) {
    console.warn('⚠️  Warning: This script is optimized for Node.js 24');
}

// Create build directory if it doesn't exist
const buildDir = path.join(__dirname, 'dist');
if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
}

// Parse args
const args = process.argv.slice(2);
const targetArg = args.find(a => a.startsWith('--target=')) || '';
const target = targetArg ? targetArg.split('=')[1] : 'win-x64';
if (!['win-x64', 'linux-x64', 'linux-arm64'].includes(target)) {
    console.error('❌ Invalid target. Use: --target=win-x64 | --target=linux-x64 | --target=linux-arm64');
    process.exit(1);
}

// Step 1: Compile frontend with webpack
console.log('\n📦 Step 1: Compiling frontend with webpack...');
try {
    execSync('webpack --mode production', { stdio: 'inherit' });
    console.log('✅ Frontend compiled successfully\n');
} catch (error) {
    console.error('❌ Error compiling frontend');
    process.exit(1);
}

// Step 2: Create SEA blob
console.log('📦 Step 2: Creating SEA blob...');
// The blob will be created in dist/sea-prep.blob according to sea-config.json
const seaBlobPath = path.join(buildDir, 'sea-prep.blob');
const applicationPath = path.join(__dirname, 'application.js');

try {
    // Generate SEA blob with the correct command
    // Note: This command requires Node.js 20.6.0+ or 21.0.0+
    execSync(`node --experimental-sea-config sea-config.json`, { 
        stdio: 'inherit',
        cwd: __dirname 
    });
    console.log('✅ SEA blob created successfully\n');
} catch (error) {
    console.error('❌ Error creating SEA blob');
    console.error('💡 Make sure:');
    console.error('   1. You are using Node.js 20.6.0+ or 21.0.0+');
    console.error('   2. sea-config.json exists and is correctly configured');
    console.error('   3. application.js exists and is valid');
    process.exit(1);
}

// Step 3: Copy Node.js executable
console.log('📦 Step 3: Preparing Node.js executables...');
const nodeExecutable = process.execPath;
const nodeCopyPathWin = path.join(buildDir, 'lan-superv-temp.exe');

if (target === 'win-x64') {
    try {
        fs.copyFileSync(nodeExecutable, nodeCopyPathWin);
        console.log('✅ Node.js executable (Windows) copied');
    } catch (error) {
        console.error('❌ Error copying Node.js executable (Windows)');
        process.exit(1);
    }
}

// Step 4: Inject SEA blob into executable
console.log('\n📦 Step 4: Injecting SEA blob into executables...');
const finalExecutableWin = path.join(buildDir, 'lan-superv.exe');
const finalExecutableLinux = path.join(buildDir, 'lan-superv-linux-x64');
const finalExecutableLinuxArm64 = path.join(buildDir, 'lan-superv-linux-arm64');

try {
    // For Node.js 24, use postject (official tool) via npx
    // Syntax: postject <exe> NODE_SEA_BLOB <blob> --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
    const sentinelFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
    
    // Use npx to run postject (will be installed automatically if needed)
    if (target === 'win-x64') {
        try {
            // Capture output to filter normal warnings
            const output = execSync(`npx --yes postject "${nodeCopyPathWin}" NODE_SEA_BLOB "${seaBlobPath}" --sentinel-fuse ${sentinelFuse}`, { 
                encoding: 'utf8',
                cwd: __dirname,
                shell: true
            });
            // Display output filtering signature warnings (normal)
            const lines = output.split('\n');
            lines.forEach(line => {
                if (line && !line.toLowerCase().includes('signature seems corrupted')) {
                    console.log(line);
                }
            });
        } catch (error) {
            // Check if file exists despite error (signature warning)
            if (!fs.existsSync(nodeCopyPathWin)) {
                console.error('❌ Error injecting SEA blob (Windows)');
                console.error(error.message);
                throw error;
            }
            // If file exists, it's just a warning, continue
            const output = error.stdout || error.stderr || '';
            const lines = output.split('\n');
            lines.forEach(line => {
                if (line && !line.toLowerCase().includes('signature seems corrupted')) {
                    console.log(line);
                }
            });
        }
        
        // Rename final file
        if (fs.existsSync(nodeCopyPathWin)) {
            if (fs.existsSync(finalExecutableWin)) {
                fs.unlinkSync(finalExecutableWin);
            }
            fs.renameSync(nodeCopyPathWin, finalExecutableWin);
            console.log(`✅ Windows executable created: ${finalExecutableWin}`);
        } else {
            throw new Error('Windows executable file was not created');
        }
    }

    // Generic function to inject SEA blob into a Linux binary
    function injectLinuxBinary(nodeLinuxPath, nodeCopyPath, finalExecutable, archName) {
        // Check that Linux Node.js binary exists and is valid
        if (!fs.existsSync(nodeLinuxPath)) {
            throw new Error(`Linux Node.js binary ${archName} does not exist: ${nodeLinuxPath}`);
        }
        
        // Check that it's actually a file (not a symbolic link that could cause problems)
        const stats = fs.statSync(nodeLinuxPath);
        if (!stats.isFile()) {
            throw new Error(`Linux Node.js binary ${archName} is not a valid file: ${nodeLinuxPath}`);
        }
        
        // Check that it's an ELF binary (first 4 bytes must be 0x7F 0x45 0x4C 0x46 = "ELF")
        const buffer = fs.readFileSync(nodeLinuxPath, { start: 0, end: 3 });
        const isElf = buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46;
        if (!isElf) {
            throw new Error(`Linux Node.js binary ${archName} is not a valid ELF file (magic: ${buffer.toString('hex')}): ${nodeLinuxPath}`);
        }
        
        // Copy the binary
        fs.copyFileSync(nodeLinuxPath, nodeCopyPath);
        
        // Ensure copied file has execute permissions (even on Windows)
        try {
            fs.chmodSync(nodeCopyPath, 0o755);
        } catch (chmodError) {
            // On Windows, chmod may fail, that's okay
        }
        
        // Check that copied binary is still a valid ELF
        const bufferAfterCopy = fs.readFileSync(nodeCopyPath, { start: 0, end: 3 });
        const isElfAfterCopy = bufferAfterCopy[0] === 0x7F && bufferAfterCopy[1] === 0x45 && bufferAfterCopy[2] === 0x4C && bufferAfterCopy[3] === 0x46;
        if (!isElfAfterCopy) {
            throw new Error(`Copied binary ${archName} is not a valid ELF file (magic: ${bufferAfterCopy.toString('hex')})`);
        }

        try {
            const output = execSync(`npx --yes postject "${nodeCopyPath}" NODE_SEA_BLOB "${seaBlobPath}" --sentinel-fuse ${sentinelFuse}`, { 
                encoding: 'utf8',
                cwd: __dirname,
                shell: true,
                stdio: 'pipe'
            });
            const lines = output.split('\n');
            lines.forEach(line => {
                if (line && !line.toLowerCase().includes('signature seems corrupted') && !line.toLowerCase().includes('can\'t find string offset')) {
                    console.log(line);
                }
            });
        } catch (error) {
            // Check if file still exists
            if (!fs.existsSync(nodeCopyPath)) {
                console.error(`❌ Error injecting SEA blob (Linux ${archName})`);
                console.error(error.message);
                throw error;
            }
            
            // Check that file is still a valid ELF after error
            const bufferAfterError = fs.readFileSync(nodeCopyPath, { start: 0, end: 3 });
            const isElfAfterError = bufferAfterError[0] === 0x7F && bufferAfterError[1] === 0x45 && bufferAfterError[2] === 0x4C && bufferAfterError[3] === 0x46;
            if (!isElfAfterError) {
                console.error(`❌ File after injection ${archName} is no longer a valid ELF binary`);
                console.error(`   Magic bytes: ${bufferAfterError.toString('hex')}`);
                throw new Error(`File after SEA injection ${archName} is no longer a valid ELF binary`);
            }
            
            // Display warnings but continue if file is valid
            const output = error.stdout || error.stderr || '';
            const lines = output.split('\n');
            lines.forEach(line => {
                if (line && !line.toLowerCase().includes('signature seems corrupted') && !line.toLowerCase().includes('can\'t find string offset')) {
                    console.log(line);
                }
            });
        }

        // Check that file after injection is still a valid ELF binary
        if (fs.existsSync(nodeCopyPath)) {
            const bufferAfter = fs.readFileSync(nodeCopyPath, { start: 0, end: 3 });
            const isElfAfter = bufferAfter[0] === 0x7F && bufferAfter[1] === 0x45 && bufferAfter[2] === 0x4C && bufferAfter[3] === 0x46;
            if (!isElfAfter) {
                console.error(`❌ File after injection ${archName} is not a valid ELF binary`);
                console.error(`   Magic bytes: ${bufferAfter.toString('hex')}`);
                throw new Error(`File after SEA injection ${archName} is not a valid ELF binary`);
            }
        }

        if (fs.existsSync(finalExecutable)) {
            fs.unlinkSync(finalExecutable);
        }
        if (fs.existsSync(nodeCopyPath)) {
            fs.renameSync(nodeCopyPath, finalExecutable);
            // Ensure final file has execute permissions
            try {
                fs.chmodSync(finalExecutable, 0o755);
            } catch (chmodError) {
                // On Windows, chmod may fail, that's okay
            }
            
            // Final verification that file is an ELF
            const finalBuffer = fs.readFileSync(finalExecutable, { start: 0, end: 3 });
            const isElfFinal = finalBuffer[0] === 0x7F && finalBuffer[1] === 0x45 && finalBuffer[2] === 0x4C && finalBuffer[3] === 0x46;
            if (!isElfFinal) {
                console.error(`❌ Final file ${archName} is not a valid ELF binary`);
                console.error(`   Magic bytes: ${finalBuffer.toString('hex')}`);
                throw new Error(`Final file ${archName} is not a valid ELF binary`);
            }
            
            console.log(`✅ Linux ${archName} executable created: ${finalExecutable}`);
            console.log(`💡 On Linux: remember to make the file executable (chmod +x ${path.basename(finalExecutable)})`);
        } else {
            throw new Error(`Linux ${archName} executable file was not created`);
        }
    }

    if (target === 'linux-x64') {
        const nodeLinuxPath = prepareLinuxNodeBinary(buildDir, nodeVersion, 'x64');
        const nodeCopyPathLinux = path.join(buildDir, 'lan-superv-linux-x64-temp');
        injectLinuxBinary(nodeLinuxPath, nodeCopyPathLinux, finalExecutableLinux, 'x64');
    }

    if (target === 'linux-arm64') {
        const nodeLinuxArm64Path = prepareLinuxNodeBinary(buildDir, nodeVersion, 'arm64');
        const nodeCopyPathLinuxArm64 = path.join(buildDir, 'lan-superv-linux-arm64-temp');
        injectLinuxBinary(nodeLinuxArm64Path, nodeCopyPathLinuxArm64, finalExecutableLinuxArm64, 'arm64');
    }
} catch (error) {
    console.error('❌ Error injecting SEA blob');
    console.error('💡 Solution: Install postject with: npm install --save-dev postject');
    console.error('   Or use npx (will be installed automatically)');
    process.exit(1);
}

// Step 5: Copy necessary files (plugins, config, node_modules, sources, etc.)
console.log('📦 Step 5: Copying external files...');
const filesToCopy = [
    { src: 'back', dst: 'dist/back' },
    { src: 'config.js.sample', dst: 'dist/config.js.sample' },
    { src: 'front', dst: 'dist/front' },
    { src: 'node_modules', dst: 'dist/node_modules' },
    { src: 'application.js', dst: 'dist/application.js' },
    { src: 'module.js', dst: 'dist/module.js' }
];

filesToCopy.forEach(({ src, dst }) => {
    const srcPath = path.join(__dirname, src);
    const dstPath = path.join(__dirname, dst);
    
    if (fs.existsSync(srcPath)) {
        if (fs.statSync(srcPath).isDirectory()) {
            // Copy recursively
            copyRecursiveSync(srcPath, dstPath);
            console.log(`  ✅ ${src} → ${dst}`);
        } else {
            // Copy the file
            const dstDir = path.dirname(dstPath);
            if (!fs.existsSync(dstDir)) {
                fs.mkdirSync(dstDir, { recursive: true });
            }
            fs.copyFileSync(srcPath, dstPath);
            console.log(`  ✅ ${src} → ${dst}`);
        }
    } else {
        console.warn(`  ⚠️  ${src} does not exist, ignored`);
    }
});

console.log('\n🎉 Build completed successfully!');
console.log(`📁 Build directory: ${buildDir}`);
if (target === 'win-x64') {
    console.log(`🚀 Windows executable: ${finalExecutableWin}`);
}
if (target === 'linux-x64') {
    console.log(`🚀 Linux x64 executable: ${finalExecutableLinux}`);
}
if (target === 'linux-arm64') {
    console.log(`🚀 Linux ARM64 executable: ${finalExecutableLinuxArm64}`);
}

// Cleanup: remove temporary directory
const tmpDir = path.join(buildDir, 'tmp');
if (fs.existsSync(tmpDir)) {
    try {
        // Recursively remove tmp directory
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (cleanupError) {
        console.warn('⚠️  Unable to remove temporary directory:', cleanupError.message);
    }
}


// Utility function to copy recursively
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

function prepareLinuxNodeBinary(buildDir, nodeVersion, arch = 'x64') {
    const v = nodeVersion.startsWith('v') ? nodeVersion.slice(1) : nodeVersion;
    const archName = arch === 'arm64' ? 'arm64' : 'x64';
    const nodeDistName = `node-v${v}-linux-${archName}`;
    const tarName = `${nodeDistName}.tar.xz`;
    const url = `https://nodejs.org/dist/v${v}/${tarName}`;
    
    // Create a temporary directory for download and extraction
    const tmpDir = path.join(buildDir, 'tmp');
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }
    
    const tarPath = path.join(tmpDir, tarName);
    const extractDir = path.join(tmpDir, nodeDistName);
    let nodeBinPath = path.join(extractDir, 'bin', 'node');

    // Function to resolve symbolic links and get the actual file
    function resolveSymlink(filePath) {
        try {
            const stats = fs.lstatSync(filePath);
            if (stats.isSymbolicLink()) {
                const linkTarget = fs.readlinkSync(filePath);
                const resolvedPath = path.isAbsolute(linkTarget) 
                    ? linkTarget 
                    : path.resolve(path.dirname(filePath), linkTarget);
                return resolveSymlink(resolvedPath);
            }
            return filePath;
        } catch (e) {
            return filePath;
        }
    }

    if (fs.existsSync(nodeBinPath)) {
        // Resolve symbolic link if necessary
        nodeBinPath = resolveSymlink(nodeBinPath);
        return nodeBinPath;
    }

    console.log(`📥 Downloading Node.js Linux ${archName}: ${url}`);
    
    // Download to tmp directory
    if (!fs.existsSync(tarPath)) {
        // Use curl or wget to download synchronously
        try {
            // Try curl first (generally available on Windows 10+ and Linux)
            execSync(`curl -L -o "${tarPath}" "${url}"`, { stdio: 'inherit', shell: true });
        } catch (curlError) {
            try {
                // Fallback to wget
                execSync(`wget -O "${tarPath}" "${url}"`, { stdio: 'inherit', shell: true });
            } catch (wgetError) {
                console.error('❌ curl and wget are not available');
                console.error('💡 On Windows 10+, curl is generally available');
                console.error('💡 Otherwise, install curl or wget, or download manually:', url);
                process.exit(1);
            }
        }
    }
    
    // Check that file exists now
    if (!fs.existsSync(tarPath)) {
        console.error('❌ Downloaded file does not exist:', tarPath);
        process.exit(1);
    }

    console.log('📦 Extracting Linux archive...');
    
    // On Windows, system tar has issues with Linux symbolic links
    // Use xz + tar npm directly on Windows, system tar on Linux
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
        // On Windows, use xz + tar npm directly to avoid symbolic link issues
        let xzAvailable = false;
        try {
            execSync('xz --version', { stdio: 'ignore', shell: true });
            xzAvailable = true;
        } catch (e) {
            // xz not available
        }
        
        if (xzAvailable) {
            // Decompress with xz then extract with tar npm
            const tarUncompressed = tarPath.replace('.xz', '');
            try {
                execSync(`xz -d "${tarPath}"`, { stdio: 'inherit', shell: true });
                const tar = require('tar');
                tar.extract({
                    file: tarUncompressed,
                    cwd: tmpDir,
                    sync: true
                });
                // Don't recompress, tmp directory will be deleted
                console.log('✅ Archive extracted successfully');
            } catch (xzError) {
                console.error('❌ Error extracting with xz + tar:', xzError.message);
                throw xzError;
            }
        } else {
            console.error('❌ xz is not available on Windows');
            console.error('💡 Solutions:');
            console.error('   1. Install 7-Zip (includes xz)');
            console.error('   2. Install xz from https://tukaani.org/xz/');
            console.error('   3. Download and extract manually:', tarPath);
            process.exit(1);
        }
    } else {
        // On Linux, use system tar which handles .tar.xz well
        try {
            execSync(`tar -xf "${tarPath}" -C "${tmpDir}"`, { stdio: 'inherit', shell: true });
            console.log('✅ Archive extracted successfully');
        } catch (tarError) {
            console.error('❌ Error extracting with system tar:', tarError.message);
            throw tarError;
        }
    }

    // Resolve symbolic link if necessary after extraction
    nodeBinPath = resolveSymlink(nodeBinPath);
    
    if (!fs.existsSync(nodeBinPath)) {
        console.error('❌ Unable to find Linux Node binary after extraction:', nodeBinPath);
        process.exit(1);
    }
    
    // Check that it's a valid ELF binary file
    const buffer = fs.readFileSync(nodeBinPath, { start: 0, end: 3 });
    const isElf = buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46;
    if (!isElf) {
        console.error(`❌ Resolved file is not a valid ELF binary: ${nodeBinPath}`);
        console.error(`   Magic bytes: ${buffer.toString('hex')}`);
        process.exit(1);
    }
    
    return nodeBinPath;
}
