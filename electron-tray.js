/**
 * Electron Tray Icon management
 */

const { Tray, Menu, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

class ElectronTray {
    constructor(config, callbacks) {
        this.config = config;
        this.callbacks = callbacks;
        this.tray = null;
        this.init();
    }
    
    init() {
        try {
            // Create tray icon
            const iconPath = this.getTrayIconPath();
            let trayIcon;
            
            if (iconPath && fs.existsSync(iconPath)) {
                trayIcon = nativeImage.createFromPath(iconPath);
                // Resize icon for different platforms
                if (process.platform === 'darwin') {
                    trayIcon.setTemplateImage(true);
                }
            } else {
                // Use default empty icon if no icon found
                console.warn('[ELECTRON-TRAY] No icon found, using default');
                trayIcon = nativeImage.createEmpty();
            }
            
            this.tray = new Tray(trayIcon);
            this.tray.setToolTip('lanSuperv - Network Supervision');
            
            // Update menu
            this.updateMenu();
            
            // Handle click events
            this.tray.on('click', () => {
                // Open browser on click (optional, can be removed if you prefer menu only)
                this.openBrowser();
            });
            
            console.log('[ELECTRON-TRAY] Tray icon initialized successfully');
        } catch (error) {
            console.error('[ELECTRON-TRAY] Error initializing tray:', error);
            throw error;
        }
    }
    
    getTrayIconPath() {
        // Try to find tray icon in assets directory
        const iconPaths = [
            path.join(__dirname, 'assets', 'tray-icon.png'),
            path.join(__dirname, 'front', 'favicon.ico')
        ];
        for (const iconPath of iconPaths) {
            if (fs.existsSync(iconPath)) {
                return iconPath;
            }
        }
        console.warn('[ELECTRON-TRAY] No tray icon found, using default');
        return null; // Electron will use default icon
    }
    
    updateMenu() {
        const menu = Menu.buildFromTemplate([
            {
                label: 'Ouvrir dans le navigateur',
                click: () => {
                    this.openBrowser();
                }
            },
            { type: 'separator' },
            {
                label: 'Démarrage automatique',
                type: 'checkbox',
                checked: this.config.autoStart || false,
                click: (menuItem) => {
                    if (this.callbacks.onAutoStartToggle) {
                        this.callbacks.onAutoStartToggle(menuItem.checked);
                    }
                    this.config.autoStart = menuItem.checked;
                    this.updateMenu(); // Refresh menu to update checkbox state
                },
                toolTip: 'Active le démarrage automatique au boot (fonctionne aussi en mode portable)'
            },
            {
                label: 'Mises à jour automatiques',
                type: 'checkbox',
                checked: this.config.autoUpdate !== false, // Default to true
                click: (menuItem) => {
                    if (this.callbacks.onAutoUpdateToggle) {
                        this.callbacks.onAutoUpdateToggle(menuItem.checked);
                    }
                    this.config.autoUpdate = menuItem.checked;
                    this.updateMenu(); // Refresh menu to update checkbox state
                },
                toolTip: 'Active les mises à jour automatiques (fonctionne aussi en mode portable)'
            },
            { type: 'separator' },
            {
                label: 'À propos',
                click: () => {
                    this.showAboutDialog();
                }
            },
            { type: 'separator' },
            {
                label: 'Quitter',
                click: () => {
                    if (this.callbacks.onQuit) {
                        this.callbacks.onQuit();
                    }
                }
            }
        ]);
        
        this.tray.setContextMenu(menu);
    }
    
    openBrowser() {
        const url = `http://localhost:${this.config.serverPort || 842}`;
        shell.openExternal(url).catch((error) => {
            console.error('[ELECTRON-TRAY] Error opening browser:', error);
            dialog.showErrorBox('Error', `Failed to open browser: ${error.message}`);
        });
    }
    
    showAboutDialog() {
        const packageJson = require('./package.json');
        const version = packageJson.version || 'Unknown';
        const nodeVersion = process.versions.node;
        const electronVersion = process.versions.electron || 'N/A';
        const repoUrl = packageJson.repository?.url || 'https://github.com/dap7z/lanSuperv';
        
        const message = `lanSuperv\n\n` +
            `Version: ${version}\n` +
            `Node.js: ${nodeVersion}\n` +
            `Electron: ${electronVersion}\n\n` +
            `Repository: ${repoUrl}`;
        
        dialog.showMessageBox({
            type: 'info',
            title: 'À propos de lanSuperv',
            message: message,
            buttons: ['OK', 'https://github.com/dap7z/lanSuperv'],
            defaultId: 0
        }).then((result) => {
            if (result.response === 1) {
                shell.openExternal(repoUrl);
            }
        });
    }
    
    destroy() {
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
        }
    }
}

module.exports = ElectronTray;
