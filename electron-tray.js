/**
 * Electron Tray Icon management
 */

const { Tray, Menu, nativeImage, shell, dialog, app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

class ElectronTray {
    constructor(config, callbacks) {
        this.config = config;
        this.callbacks = callbacks;
        this.tray = null;
        this.debugWindow = null;
        this.aboutWindow = null;
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
                // If debug window exists, focus/restore it
                if (this.debugWindow) {
                    if (this.debugWindow.isDestroyed()) {
                        // Recreate if destroyed
                        if (this.callbacks.onRecreateDebugWindow) {
                            this.callbacks.onRecreateDebugWindow();
                        }
                    } else {
                        if (this.debugWindow.isMinimized()) {
                            this.debugWindow.restore();
                        }
                        this.debugWindow.focus();
                    }
                } else {
                    // Open browser if no debug window
                    this.openBrowser();
                }
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
            {
                label: 'Minimiser au démarrage',
                type: 'checkbox',
                checked: this.config.minimizeOnStartup || false,
                click: (menuItem) => {
                    if (this.callbacks.onMinimizeOnStartupToggle) {
                        this.callbacks.onMinimizeOnStartupToggle(menuItem.checked);
                    }
                    this.config.minimizeOnStartup = menuItem.checked;
                    this.updateMenu(); // Refresh menu to update checkbox state
                },
                toolTip: 'Minimise la fenêtre de debug au démarrage de l\'application'
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
        // If window already exists, just focus it
        if (this.aboutWindow && !this.aboutWindow.isDestroyed()) {
            this.aboutWindow.focus();
            return;
        }
        
        const packageJson = require('./package.json');
        const version = packageJson.version || 'Unknown';
        const nodeVersion = process.versions.node;
        const electronVersion = process.versions.electron || 'N/A';
        const repoUrl = packageJson.repository?.url || 'https://github.com/dap7z/lanSuperv';
        
        // Get application directory
        let appDirectory = 'Unknown';
        try {
            const exePath = app.getPath('exe');
            appDirectory = path.dirname(exePath);
        } catch (error) {
            console.error('[ELECTRON-TRAY] Error getting app directory:', error);
        }
        
        // Create about window
        this.aboutWindow = new BrowserWindow({
            width: 500,
            height: 350,
            title: 'À propos de lanSuperv',
            resizable: false,
            minimizable: false,
            maximizable: false,
            modal: true,
            autoHideMenuBar: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        
        // Setup IPC handlers with named functions so they can be removed
        const handleOpenFolder = () => {
            shell.openPath(appDirectory).catch((error) => {
                console.error('[ELECTRON-TRAY] Error opening folder:', error);
            });
        };
        
        const handleOpenRepo = () => {
            shell.openExternal(repoUrl);
        };
        
        ipcMain.on('about-open-folder', handleOpenFolder);
        ipcMain.on('about-open-repo', handleOpenRepo);
        
        // Create HTML content
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>À propos de lanSuperv</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                        padding: 20px;
                        margin: 0;
                        background: #f5f5f5;
                    }
                    .container {
                        background: white;
                        border-radius: 8px;
                        padding: 20px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    }
                    h1 {
                        margin: 0 0 20px 0;
                        font-size: 24px;
                        color: #333;
                    }
                    .info-row {
                        margin: 12px 0;
                        display: flex;
                        align-items: center;
                    }
                    .label {
                        font-weight: 600;
                        color: #666;
                        min-width: 120px;
                        margin-right: 10px;
                    }
                    .value {
                        color: #333;
                    }
                    button {
                        background: #0078d4;
                        color: white;
                        border: none;
                        padding: 6px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                        font-family: inherit;
                        transition: background 0.2s;
                    }
                    button:hover {
                        background: #106ebe;
                    }
                    button:active {
                        background: #005a9e;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>lanSuperv</h1>
                    <div class="info-row">
                        <span class="label">Version:</span>
                        <span class="value">${version}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Node.js:</span>
                        <span class="value">${nodeVersion}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Electron:</span>
                        <span class="value">${electronVersion}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">AppDirectory:</span>
                        <button id="btn-folder">${appDirectory}</button>
                    </div>
                    <div class="info-row">
                        <span class="label">Repository:</span>
                        <button id="btn-repo">${repoUrl.replace('https://', '')}</button>
                    </div>
                </div>
                <script>
                    const { ipcRenderer } = require('electron');
                    
                    document.getElementById('btn-folder').addEventListener('click', () => {
                        ipcRenderer.send('about-open-folder');
                    });
                    
                    document.getElementById('btn-repo').addEventListener('click', () => {
                        ipcRenderer.send('about-open-repo');
                    });
                </script>
            </body>
            </html>
        `;
        
        this.aboutWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        
        this.aboutWindow.on('closed', () => {
            ipcMain.removeListener('about-open-folder', handleOpenFolder);
            ipcMain.removeListener('about-open-repo', handleOpenRepo);
            this.aboutWindow = null;
        });
    }
    
    setDebugWindow(debugWindow) {
        this.debugWindow = debugWindow;
    }
    
    destroy() {
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
        }
        this.debugWindow = null;
    }
}

module.exports = ElectronTray;
