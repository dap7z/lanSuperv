/**
 * Electron Auto Updater configuration
 * Handles automatic updates via electron-updater
 */

const { autoUpdater } = require('electron-updater');

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
        
        // Configure update check interval (daily)
        autoUpdater.checkForUpdatesAndNotify();
        this.updateCheckInterval = setInterval(() => {
            if (this.autoUpdateEnabled) {
                autoUpdater.checkForUpdatesAndNotify();
            }
        }, 24 * 60 * 60 * 1000); // 24 hours
        
        // Setup event handlers
        this.setupEventHandlers();
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
                autoUpdater.quitAndInstall(false, true); // isSilent, isForceRunAfter
            }, 5000); // 5 seconds delay
        });
        
        autoUpdater.on('error', (error) => {
            console.error('[ELECTRON-UPDATER] Error:', error);
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
            autoUpdater.checkForUpdatesAndNotify();
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
            autoUpdater.checkForUpdatesAndNotify();
        }
    }
    
    setNotifications(notifications) {
        this.notifications = notifications;
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
