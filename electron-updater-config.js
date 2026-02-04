/**
 * Electron Auto Updater configuration
 * Handles automatic updates via electron-updater
 */

const { autoUpdater } = require('electron-updater');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

class ElectronUpdater {
    constructor() {
        this.autoUpdateEnabled = true;
        this.updateCheckInterval = null;
        this.notifications = null;
    }
    
    init(config) {
        this.autoUpdateEnabled = config.autoUpdate !== false;
        
        // Configure autoUpdater
        autoUpdater.setFeedURL({
            provider: 'github',
            owner: 'dap7z',
            repo: 'lanSuperv'
        });
        
        // Setup event handlers first
        this.setupEventHandlers();
        
        // Configure update check interval (daily)
        this.checkForUpdatesSafe();
        this.updateCheckInterval = setInterval(() => {
            if (this.autoUpdateEnabled) {
                this.checkForUpdatesSafe();
            }
        }, 24 * 60 * 60 * 1000); // 24 hours
    }
    
    setupEventHandlers() {
        autoUpdater.on('checking-for-update', () => {
            console.log('[ELECTRON-UPDATER] Checking for updates...');
        });
        
        autoUpdater.on('update-available', (info) => {
            console.log('[ELECTRON-UPDATER] Update available:', info.version);
            if (this.notifications) {
                this.notifications.notifyUpdateAvailable(info.version);
            }
        });
        
        autoUpdater.on('update-not-available', (info) => {
            console.log('[ELECTRON-UPDATER] Update not available. Current version is latest.');
        });
        
        autoUpdater.on('update-downloaded', (info) => {
            console.log('[ELECTRON-UPDATER] Update downloaded:', info.version);
            if (this.notifications) {
                this.notifications.notifyUpdateInstalled(info.version);
            }
            
            // Automatically install update without user interaction
            // Wait a bit to ensure server can finish current operations
            setTimeout(() => {
                console.log('[ELECTRON-UPDATER] Installing update automatically...');
                try {
                    // Set flag to indicate update installation
                    // This prevents shutdown() from being called during update
                    if (typeof process !== 'undefined' && process.env) {
                        process.env.LANSUPERV_UPDATING = 'true';
                    }
                    
                    // For portable builds (zip), use custom installation script
                    // Get the downloaded zip file path using installerPath property
                    const downloadedFile = autoUpdater.installerPath;
                    if (downloadedFile && downloadedFile.endsWith('.zip')) {
                        console.log('[ELECTRON-UPDATER] Portable zip build, using custom installation script');
                        this.installPortableUpdate(downloadedFile);
                    }else{
                        console.error('[ELECTRON-UPDATER] Portable zip build not found.');
                    }
                } catch (error) {
                    console.error('[ELECTRON-UPDATER] Error installing update:', error);
                    console.error('[ELECTRON-UPDATER] Error details:', {
                        message: error.message,
                        code: error.code,
                        stack: error.stack
                    });
                    
                    // Check if it's an elevate.exe error
                    if (error.message && error.message.includes('elevate.exe')) {
                        console.error('[ELECTRON-UPDATER] elevate.exe error detected. This may be due to spaces in the installation path.');
                        if (this.notifications) {
                            this.notifications.notifyError('Update Installation Failed', 
                                'Failed to install update automatically (elevate.exe error). Please close the application and install the update manually from GitHub releases.');
                        }
                    } else {
                        if (this.notifications) {
                            this.notifications.notifyError('Update Installation Failed', 
                                'Failed to install update automatically. Please download and install manually from GitHub releases.');
                        }
                    }
                    
                    // Reset flag on error
                    if (typeof process !== 'undefined' && process.env) {
                        delete process.env.LANSUPERV_UPDATING;
                    }
                }
            }, 5000); // 5 seconds delay
        });
        
        autoUpdater.on('error', (error) => {
            console.error('[ELECTRON-UPDATER] Error:', error);
            console.error('[ELECTRON-UPDATER] Error details:', {
                message: error.message,
                code: error.code,
                stack: error.stack
            });
            
            // Check if it's an elevate.exe error during installation
            if (error.message && (error.message.includes('elevate.exe') || error.message.includes('ENOENT'))) {
                console.error('[ELECTRON-UPDATER] elevate.exe error detected. This may be due to spaces in the installation path.');
                // Reset flag on error
                if (typeof process !== 'undefined' && process.env) {
                    delete process.env.LANSUPERV_UPDATING;
                }
                if (this.notifications) {
                    this.notifications.notifyError('Update Installation Failed', 
                        'Failed to install update automatically (elevate.exe error). Please close the application and install the update manually from GitHub releases.');
                }
            }
            // Don't block the application, just log the error
        });
        
        autoUpdater.on('download-progress', (progressObj) => {
            const message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
            console.log('[ELECTRON-UPDATER]', message);
        });
    }
    
    setAutoUpdate(enabled) {
        this.autoUpdateEnabled = enabled;
        if (enabled) {
            // Check immediately if enabled
            this.checkForUpdatesSafe();
        } else {
            // Clear interval if disabled
            if (this.updateCheckInterval) {
                clearInterval(this.updateCheckInterval);
                this.updateCheckInterval = null;
            }
        }
    }
    
    checkForUpdates() {
        if (this.autoUpdateEnabled) {
            this.checkForUpdatesSafe();
        }
    }
    
    // Safe wrapper for checkForUpdatesAndNotify that handles promise rejections
    checkForUpdatesSafe() {
        try {
            const updatePromise = autoUpdater.checkForUpdatesAndNotify();
            if (updatePromise && typeof updatePromise.catch === 'function') {
                updatePromise.catch((error) => {
                    console.error('[ELECTRON-UPDATER] Error checking for updates:', error.message);
                });
            }
        } catch (error) {
            // Handle synchronous errors
            console.error('[ELECTRON-UPDATER] Error initiating update check:', error.message);
        }
    }
    
    setNotifications(notifications) {
        this.notifications = notifications;
    }
    
    /**
     * Install portable update (zip file) using custom PowerShell script
     * The script will:
     * 1. Close the application
     * 2. Extract the zip to the installation directory (overwriting files)
     * 3. Restart the application
     */
    installPortableUpdate(zipPath) {
        try {
            const exePath = app.getPath('exe');
            const installDir = path.dirname(exePath);
            const exeName = path.basename(exePath);
            
            console.log('[ELECTRON-UPDATER] Creating installation script...');
            console.log('[ELECTRON-UPDATER] Zip file:', zipPath);
            console.log('[ELECTRON-UPDATER] Install directory:', installDir);
            console.log('[ELECTRON-UPDATER] Executable:', exeName);
            
            // Create temporary PowerShell script
            const tempDir = require('os').tmpdir();
            const scriptPath = path.join(tempDir, 'lanSuperv-update-install.ps1');
            
            // Escape paths for PowerShell: use single quotes and escape single quotes inside
            const escapedZipPath = zipPath.replace(/'/g, "''");
            const escapedInstallDir = installDir.replace(/'/g, "''");
            const escapedExePath = exePath.replace(/'/g, "''");
            
            // Get process name without .exe extension for Get-Process
            const processName = exeName.replace(/\.exe$/i, '');
            
            // Create PowerShell script content
            const scriptContent = `# lanSuperv Update Installation Script
# This script extracts the update zip and restarts the application

$ErrorActionPreference = "Stop"
$processus = "${exeName}"

Write-Host "[UPDATER] Waiting for $processus to close..."

# Wait for lanSuperv.exe process to terminate
$processName = "${processName}"
while ($true) {
    $process = Get-Process -Name $processName -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "[UPDATER] ... wait ..."
        Start-Sleep -Seconds 2
    } else {
        break
    }
}

Write-Host "[UPDATER] Ok $processus has closed"

# Waiting 1 additional second before extraction
Start-Sleep -Seconds 1

# Set paths as PowerShell variables to handle spaces correctly
$zipPath = '${escapedZipPath}'
$installDir = '${escapedInstallDir}'

Write-Host "[UPDATER] Extracting update to: $installDir"
# Use Expand-Archive to extract (overwrite existing files with -Force)
try {
    Expand-Archive -Path $zipPath -DestinationPath $installDir -Force
    Write-Host "[UPDATER] Update extracted successfully"
} catch {
    Write-Host "[UPDATER] ERROR: Failed to extract update"
    Write-Host $_.Exception.Message
    Read-Host "Appuyer sur une touche pour continuer..."
    exit 1
}

# Waiting 1 second before restarting
Start-Sleep -Seconds 1

# BYPASS
# Write-Host "[UPDATER] Press any key to restart the application..."
# Read-Host

Write-Host "[UPDATER] Restarting application..."
# Start the application
$exePath = '${escapedExePath}'
Start-Process -FilePath $exePath
`;
            
            // Write script to file
            fs.writeFileSync(scriptPath, scriptContent, 'utf8');
            console.log('[ELECTRON-UPDATER] Installation script created at:', scriptPath);
            console.log('[ELECTRON-UPDATER] Full path:', path.resolve(scriptPath));
            
            // Execute the script with PowerShell
            // Use elevate.exe if available, otherwise run PowerShell directly
            const elevatePath = path.join(process.resourcesPath, 'elevate.exe');
            let scriptCommand;
            let scriptArgs;
            
            if (fs.existsSync(elevatePath)) {
                // Use elevate.exe to run PowerShell with admin rights
                scriptCommand = elevatePath;
                scriptArgs = ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
                console.log('[ELECTRON-UPDATER] Using elevate.exe to run PowerShell script');
            } else {
                // Run PowerShell directly (may require manual UAC prompt)
                scriptCommand = 'powershell.exe';
                scriptArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
                console.log('[ELECTRON-UPDATER] Running PowerShell script directly');
            }
            
            // Spawn the script
            const child = spawn(scriptCommand, scriptArgs, {
                detached: true,
                stdio: 'ignore',
                shell: true
            });
            
            child.unref();
            
            // Quit the application to allow the script to extract and restart
            console.log('[ELECTRON-UPDATER] Quitting application to allow update installation...');
            setTimeout(() => {
                app.quit();
            }, 1000);
            
        } catch (error) {
            console.error('[ELECTRON-UPDATER] Error creating installation script:', error);
            throw error;
        }
    }
}

// Export singleton instance
const electronUpdater = new ElectronUpdater();

module.exports = {
    init: (config) => electronUpdater.init(config),
    setAutoUpdate: (enabled) => electronUpdater.setAutoUpdate(enabled),
    checkForUpdates: () => electronUpdater.checkForUpdates(),
    setNotifications: (notifications) => electronUpdater.setNotifications(notifications)
};
