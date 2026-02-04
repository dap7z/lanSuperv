// ~~~~~~~~ ENTRY POINT FOR ELECTRON MAIN BIG PROCESS (!= ELECTRON PLUGIN TINY PROCESS WHEN LANSUPERV_PLUGIN_MODE) ~~~~~~~~
const fs = require('fs');
const path = require('path');
const F = require(path.join(__dirname, 'back', 'functions.js'));

// Export initialization function that receives dependencies from electron-entrypoint.js
module.exports = function initializeMainApp(dependencies) {
    // Extract dependencies
    const { app, BrowserWindow, spawn, ElectronTray, ElectronUpdater, ElectronNotifications, ElectronAutoStart } = dependencies;
    
    // Initialize notifications first (needed by updater)
    let notifications;
    try {
        if (ElectronNotifications) {
            notifications = ElectronNotifications;
            notifications.init();
        } else {
            F.writeLogToFile('WARNING: ElectronNotifications not available');
        }
    } catch (error) {
        F.writeLogToFile('ERROR initializing notifications: ' + error.message);
    }

// Global variables
let nodeProcess = null;
let tray = null;
let config = null;
let electronConfig = null;
let debugWindow = null;

// Load Electron configuration
function loadElectronConfig() {
    // Use the same directory as the executable (portable mode)
    // This ensures the config is persistent and writable
    let configDir;
    try {
        // This function is called in app.whenReady(), so app is available
        const exePath = app.getPath('exe');
        configDir = path.dirname(exePath);
    } catch (error) {
        // Fallback if app.getPath fails (shouldn't happen, but just in case)
        configDir = path.dirname(process.execPath);
        F.writeLogToFile('[ELECTRON] Using process.execPath fallback for config dir: ' + error.message);
    }
    
    const configPath = path.join(configDir, 'electron-config.json');
    const defaultConfig = {
        autoStart: false,
        autoUpdate: true,
        minimizeOnStartup: false,
        serverPort: 842
    };
    
    if (fs.existsSync(configPath)) {
        try {
            electronConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            // Merge with defaults to ensure all properties exist
            electronConfig = { ...defaultConfig, ...electronConfig };
        } catch (error) {
            F.writeLogToFile('[ELECTRON] Error loading electron-config.json, using defaults: ' + error.message);
            electronConfig = defaultConfig;
        }
    } else {
        electronConfig = defaultConfig;
        // Save default config
        try {
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        } catch (error) {
            F.writeLogToFile('[ELECTRON] Error saving default electron-config.json: ' + error.message);
        }
    }
    
    return electronConfig;
}

// Load server config to get SERVER_PORT
function loadServerConfig() {
    try {
        const F = require('./back/functions');
        const configPath = path.join(F.getAppDirectory(), 'config.js');
    
        try {
            // Load config.js and extract SERVER_PORT
            const configContent = fs.readFileSync(configPath, 'utf8');
            const portMatch = configContent.match(/PARAMS\['SERVER_PORT'\]\s*=\s*(\d+)/);
            if (portMatch) {
                return parseInt(portMatch[1], 10);
            }
        } catch (error) {
            F.writeLogToFile('[ELECTRON] Error loading config.js: ' + error.message);
        }
        
    } catch (error) {
        F.writeLogToFile('[ELECTRON] Error in loadServerConfig: ' + error.message);
    }
    
    return 842; // Default port
}

// Launch Node.js server
function launchNodeServer() {
    try {
        
        // In Electron, __dirname points to the app.asar or resources/app directory
        // We need to get the actual application directory
        const appPath = app.getAppPath();
        const isAsar = appPath.endsWith('.asar');
        const appDir = isAsar ? path.dirname(appPath) : appPath;

        // Get config directory using app.getPath('exe') (same directory as the Electron executable)
        // In "dir" mode, the executable is directly in the output directory
        // We must use app.getPath('exe') because process.execPath in the Node.js child process
        // will point to node.exe, not the Electron executable
        let configDir;
        let electronExePath;
        try {
            // Use app.getPath('exe') to get the Electron executable directory
            const exePath = app.getPath('exe');
            electronExePath = exePath; // Store full path to Electron executable
            configDir = path.dirname(exePath);
            /*
            // DIAG DIR PATHS :
            F.writeLogToFile('[ELECTRON] Electron executable path: ' + exePath);
            F.writeLogToFile('[ELECTRON] Config dir (from app.getPath): ' + configDir);
            F.writeLogToFile('[ELECTRON] Config path: ' + path.join(configDir, 'config.js'));
            F.writeLogToFile('[ELECTRON] Config exists: ' + fs.existsSync(path.join(configDir, 'config.js')));
            */
        } catch (error) {
            F.writeLogToFile('[ELECTRON] Error getting config dir, using F.getAppDirectory(): ' + error.message);
            try {
                const F = require('./back/functions');
                configDir = F.getAppDirectory();
                F.writeLogToFile('[ELECTRON] Config dir from F.getAppDirectory(): ' + configDir);
                // Try to find Electron executable in configDir
                electronExePath = path.join(configDir, path.basename(process.execPath));
            } catch (error2) {
                F.writeLogToFile('[ELECTRON] Error getting config dir, using app dir: ' + error2.message);
                // Fallback to app directory
                configDir = appDir;
                electronExePath = process.execPath; // Fallback to process.execPath
            }
        }
        const configPath = path.join(configDir, 'config.js');
        
        // Always use 'node' from system PATH to launch the server
        // The server runs as a separate Node.js process, not inside Electron
        const nodeExecutable = 'node';
        
        // In Electron compiled app with asar, files needed by external Node.js process
        // must be unpacked in app.asar.unpacked
        let serverScript;
        if (isAsar) {
            // With asar enabled, unpacked files are in app.asar.unpacked
            // appDir is resources/ directory, so app.asar.unpacked is at the same level
            const unpackedPath = path.join(appDir, 'app.asar.unpacked');
            serverScript = path.join(unpackedPath, 'start.js');
        } else {
            // Development mode
            serverScript = path.join(__dirname, 'start.js');
        }
        
        const args = [serverScript];
        if (configPath && fs.existsSync(configPath)) {
            args.push('--config', configPath);
        }
        
        // Check if server script exists
        if (!fs.existsSync(serverScript)) {
            const errorMsg = `Server script not found: ${serverScript}`;
            F.writeLogToFile('[ELECTRON] ERROR: ' + errorMsg);
            throw new Error(errorMsg);
        }
        
        // Pass the config directory to the Node.js server via environment variable
        // This allows the server to find config.js and plugins at the correct location
        const nodeEnv = {
            ...process.env,
            NODE_ENV: 'production',
            LANSUPERV_CONFIG_DIR: configDir, // Pass config directory to server
            LANSUPERV_PLUGINS_DIR: path.join(configDir, 'back', 'plugins'), // Pass plugins directory to server
            LANSUPERV_ELECTRON_EXE: electronExePath // Pass Electron executable path for plugins
        };
        
        console.log('[ELECTRON] Passing to Node.js server:');
        console.log('[ELECTRON]   LANSUPERV_CONFIG_DIR: ' + nodeEnv.LANSUPERV_CONFIG_DIR);
        console.log('[ELECTRON]   LANSUPERV_PLUGINS_DIR: ' + nodeEnv.LANSUPERV_PLUGINS_DIR);
        console.log('[ELECTRON]   LANSUPERV_ELECTRON_EXE: ' + nodeEnv.LANSUPERV_ELECTRON_EXE);
        
        // Use cross-spawn which handles paths with spaces correctly on Windows
        // cross-spawn automatically finds 'node' in PATH, no need for shell: true
        nodeProcess = spawn(nodeExecutable, args, {
            cwd: appDir,
            stdio: ['ignore', 'pipe', 'pipe'], // Capture stdout/stderr for debugging
            env: nodeEnv
        });
        
        //-- Capture and redirect server logs to debug window
        if (nodeProcess.stdout) {
            nodeProcess.stdout.on('data', (data) => {
                const output = data.toString();
                // This will automatically go to debug window via console.log redirection
                console.log('[NODE-SERVER]', output.trim());
            });
        }
        if (nodeProcess.stderr) {
            nodeProcess.stderr.on('data', (data) => {
                const output = data.toString();
                // This will automatically go to debug window via console.error redirection
                console.error('[NODE-SERVER-ERROR]', output.trim());
            });
        }
        //--
        
        // Error in electron window if the server fails to launch
        nodeProcess.on('error', (error) => {
            console.error('[ELECTRON] Error launching Node.js server:', error);
            if (ElectronNotifications) {
                ElectronNotifications.notifyError('Failed to start server', error.message);
            }
        });
        
        // Error in electron window if the server crashes
        nodeProcess.on('exit', (code, signal) => {
            console.log(`[ELECTRON] Node.js server exited with code ${code} and signal ${signal}`);
            if (code !== 0 && signal !== 'SIGTERM') {
                // Server crashed, notify user
                if (ElectronNotifications) {
                    ElectronNotifications.notifyError('Server crashed', `Server exited unexpectedly (code: ${code})`);
                }
            }
        });
        
        return nodeProcess;
    } catch (error) {
        F.writeLogToFile('[ELECTRON] ERROR in launchNodeServer: ' + error.message);
        F.writeLogToFile('[ELECTRON] ERROR stack: ' + error.stack);
        throw error;
    }
}

// Graceful shutdown
function shutdown() {
    F.writeLogToFile('[ELECTRON] Shutting down...');
    console.log('[ELECTRON] Shutting down...');
    
    // Send SIGTERM to Node.js process
    if (nodeProcess) {
        F.writeLogToFile('[ELECTRON] Sending SIGTERM to Node.js server...');
        console.log('[ELECTRON] Sending SIGTERM to Node.js server...');
        nodeProcess.kill('SIGTERM');
        
        // Wait 1 minute, then force kill
        setTimeout(() => {
            if (nodeProcess && !nodeProcess.killed) {
                F.writeLogToFile('[ELECTRON] Force killing Node.js server...');
                console.log('[ELECTRON] Force killing Node.js server...');
                nodeProcess.kill('SIGKILL');
            }
        }, 60000); // 1 minute
    }
    
    // Destroy tray
    if (tray) {
        tray.destroy();
    }
    
    // Quit Electron
    app.quit();
}

// Create debug console window
function createDebugWindow() {
    try {
        const shouldMinimize = electronConfig && electronConfig.minimizeOnStartup === true;
        // Always create debug window to see what's happening
        debugWindow = new BrowserWindow({
            width: 1000,
            height: 700,
            title: 'lanSuperv Debug Console',
            show: !shouldMinimize, // Hide if should minimize
            skipTaskbar: true, // Don't show in taskbar
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        
        // Minimize if configured
        if (shouldMinimize) {
            debugWindow.minimize();
        }
        
        // Redirect console to debug window and file
        const originalLog = console.log;
        const originalError = console.error;
        
        console.log = (...args) => {
            const message = args.join(' ');
            F.writeLogToFile('[LOG] ' + message);
            originalLog.apply(console, args);
            if (debugWindow && !debugWindow.isDestroyed()) {
                try {
                    debugWindow.webContents.send('log', { type: 'log', message: message });
                } catch (e) {
                    // Ignore if window not ready
                }
            }
        };
        
        console.error = (...args) => {
            const message = args.join(' ');
            F.writeLogToFile('[ERROR] ' + message);
            originalError.apply(console, args);
            if (debugWindow && !debugWindow.isDestroyed()) {
                try {
                    debugWindow.webContents.send('log', { type: 'error', message: message });
                } catch (e) {
                    // Ignore if window not ready
                }
            }
        };
        
        // Create simple HTML for debug window
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>lanSuperv Debug Console</title>
                <style>
                    body { font-family: 'Consolas', 'Monaco', monospace; padding: 10px; background: #1e1e1e; color: #d4d4d4; margin: 0; }
                    #logs { height: calc(100vh - 60px); overflow-y: auto; }
                    .log { margin: 2px 0; padding: 2px 5px; }
                    .error { color: #f48771; background: rgba(244, 135, 113, 0.1); }
                    h2 { margin: 0 0 10px 0; }
                </style>
            </head>
            <body>
                <h2>lanSuperv Debug Console</h2>
                <div id="logs"></div>
                <script>
                    const { ipcRenderer } = require('electron');
                    const logsDiv = document.getElementById('logs');
                    ipcRenderer.on('log', (event, data) => {
                        const div = document.createElement('div');
                        div.className = 'log ' + data.type;
                        div.textContent = '[' + new Date().toLocaleTimeString() + '] ' + data.message;
                        logsDiv.appendChild(div);
                        logsDiv.scrollTop = logsDiv.scrollHeight;
                    });
                </script>
            </body>
            </html>
        `;
        
        debugWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        
        debugWindow.on('closed', () => {
            debugWindow = null;
        });
        
        F.writeLogToFile('[DEBUG] Debug window created');
        console.log('[DEBUG] Debug window created');
    } catch (error) {
        // Fallback: write to file even if window creation fails
        F.writeLogToFile('[FATAL] Failed to create debug window: ' + error.message);
        F.writeLogToFile('[FATAL] Stack: ' + error.stack);
    }
}


    // App event handlers
    app.whenReady().then(() => {
    F.writeLogToFile('App is ready!');
    
    // Load configurations first (needed for debug window creation)
    try {
        electronConfig = loadElectronConfig();
        const serverPort = loadServerConfig();
        config = {
            ...electronConfig,
            serverPort: serverPort
        };
        console.log('[ELECTRON] Config loaded:', config);
    } catch (error) {
        F.writeLogToFile('ERROR loading config: ' + error.message);
        // Use defaults
        electronConfig = loadElectronConfig();
        config = { ...electronConfig, serverPort: 842 };
    }
    
    // Create debug window after config is loaded
    try {
        createDebugWindow();
    } catch (error) {
        F.writeLogToFile('ERROR creating debug window: ' + error.message);
        F.writeLogToFile('ERROR stack: ' + error.stack);
    }
    
    // Small delay to ensure debug window is ready
    setTimeout(() => {

        /*
        // DIR PATHS DIAG :
        console.log('[ELECTRON] App path:', app.getAppPath());
        console.log('[ELECTRON] Exec path:', process.execPath);
        console.log('[ELECTRON] CWD:', process.cwd());
        console.log('[ELECTRON] __dirname:', __dirname);
        */
        
        try {
            
            // Initialize Electron modules
            ElectronAutoStart.init(config);
            ElectronUpdater.init(config);
            ElectronUpdater.setNotifications(notifications);
            
            // Create tray icon FIRST (even if server fails, user can see the app is running)
            try {
                tray = new ElectronTray(config, {
                    onQuit: shutdown,
                    onMinimizeOnStartupToggle: (enabled) => {
                        config.minimizeOnStartup = enabled;
                        saveElectronConfig();
                    },
                    onAutoStartToggle: (enabled) => {
                        config.autoStart = enabled;
                        ElectronAutoStart.setAutoStart(enabled);
                        saveElectronConfig();
                    },
                    onAutoUpdateToggle: (enabled) => {
                        config.autoUpdate = enabled;
                        ElectronUpdater.setAutoUpdate(enabled);
                        saveElectronConfig();
                    },
                    onRecreateDebugWindow: () => {
                        createDebugWindow();
                        if (tray) {
                            tray.setDebugWindow(debugWindow);
                        }
                    }
                });
                // Set debug window reference in tray
                if (debugWindow) {
                    tray.setDebugWindow(debugWindow);
                }
            } catch (trayError) {
                F.writeLogToFile('[ELECTRON] ERROR creating tray icon: ' + trayError.message);
                F.writeLogToFile('[ELECTRON] ERROR stack: ' + trayError.stack);
                console.error('[ELECTRON] Error creating tray icon:', trayError);
                // Continue even if tray fails
            }
            
            // Launch Node.js server
            try {
                launchNodeServer();
            } catch (serverError) {
                F.writeLogToFile('[ELECTRON] ERROR launching server: ' + serverError.message);
                F.writeLogToFile('[ELECTRON] ERROR stack: ' + serverError.stack);
                console.error('[ELECTRON] Error launching server:', serverError);
                if (tray) {
                    ElectronNotifications.notifyError('Server Error', `Failed to start server: ${serverError.message}`);
                }
            }
            
            // Check for updates if enabled
            if (config.autoUpdate) {
                ElectronUpdater.checkForUpdates();
            }
            
        } catch (error) {
            F.writeLogToFile('[FATAL] Error during initialization: ' + error.message);
            F.writeLogToFile('[FATAL] Stack: ' + error.stack);
            console.error('[ELECTRON] Fatal error during initialization:', error);
            console.error('[ELECTRON] Error stack:', error.stack);
            if (tray) {
                ElectronNotifications.notifyError('Initialization Error', error.message);
            }
        }
    }, 500); // 500ms delay to ensure debug window is ready
}).catch((error) => {
    F.writeLogToFile('[FATAL] App ready promise rejected: ' + error.message);
    F.writeLogToFile('[FATAL] Stack: ' + error.stack);
    console.error('[ELECTRON] App ready promise rejected:', error);
});

app.on('window-all-closed', () => {
    // Don't quit when all windows are closed (we're using tray icon)
    // Keep the app running
    // But allow debug window to close without quitting
    if (debugWindow && !debugWindow.isDestroyed()) {
        debugWindow = null;
    }
});

app.on('before-quit', (event) => {
    // Prevent default quit, use our graceful shutdown
    event.preventDefault();
    shutdown();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    F.writeLogToFile('[FATAL] Uncaught exception: ' + error.message);
    F.writeLogToFile('[FATAL] Stack: ' + error.stack);
    console.error('[ELECTRON] Uncaught exception:', error);
    if (tray) {
        ElectronNotifications.notifyError('Fatal Error', error.message);
    }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    F.writeLogToFile('[FATAL] Unhandled rejection: ' + (reason && reason.message ? reason.message : String(reason)));
    F.writeLogToFile('[FATAL] Stack: ' + (reason && reason.stack ? reason.stack : 'No stack'));
    console.error('[ELECTRON] Unhandled rejection at:', promise, 'reason:', reason);
});

// Save Electron configuration
function saveElectronConfig() {
    // Use the same directory as the executable (portable mode)
    // This ensures the config is persistent and writable
    let configDir;
    try {
        // This function is called after app.whenReady(), so app is available
        const exePath = app.getPath('exe');
        configDir = path.dirname(exePath);
    } catch (error) {
        F.writeLogToFile('[ELECTRON] Error getting config dir for save: ' + error.message);
        return; // Can't save if we can't determine the directory
    }
    
    const configPath = path.join(configDir, 'electron-config.json');
    
    try {
        fs.writeFileSync(configPath, JSON.stringify({
            autoStart: config.autoStart || false,
            autoUpdate: config.autoUpdate !== false, // Default to true
            minimizeOnStartup: config.minimizeOnStartup || false
        }, null, 2));
        F.writeLogToFile('[ELECTRON] Electron config saved to: ' + configPath);
    } catch (error) {
        F.writeLogToFile('[ELECTRON] Error saving electron-config.json: ' + error.message);
        console.error('[ELECTRON] Error saving electron-config.json:', error);
    }
}
// End of module.exports function
};