#!/usr/bin/env node
/**
 * Electron main process
 * Entry point for Electron application
 * Launches the Node.js server in background and manages Electron features
 * Or only launch an electron plugin, example plugins\local-responses\screen-joke\app.js
 */

// Write to log file immediately (before any imports)
const fs = require('fs');
const path = require('path');
const F = require(path.join(__dirname, 'back', 'functions.js'));




let app, BrowserWindow, spawn;
let ElectronTray, ElectronUpdater, ElectronNotifications, ElectronAutoStart;

// Check if we're in plugin mode BEFORE loading Electron
// LANSUPERV_PLUGIN_EXECUTE is used for both Electron plugins (app.js) and Node.js plugins (execute.js)
const pluginAppPath = process.env.LANSUPERV_PLUGIN_EXECUTE;
const isPluginMode = !!pluginAppPath;

try {
    const electron = require('electron');
    app = electron.app;
    BrowserWindow = electron.BrowserWindow;
    
    // Use cross-spawn for better Windows path handling (spaces, special characters)
    spawn = require('cross-spawn');
    
    if (isPluginMode) {
        // Plugin mode - determine if it's an Electron plugin (app.js) or Node.js plugin (execute.js)
        const resolvedPluginPath = path.resolve(pluginAppPath);
        const pluginBasename = path.basename(resolvedPluginPath);
        const isElectronPlugin = pluginBasename === 'app.js';
        const isNodePlugin = pluginBasename === 'execute.js';
        
        F.writeLogToFile('[ELECTRON] Plugin mode detected, plugin path: ' + resolvedPluginPath);
        console.log('[ELECTRON] Plugin mode detected, plugin path:', resolvedPluginPath);
        console.log('[ELECTRON] Plugin type:', isElectronPlugin ? 'Electron (app.js)' : isNodePlugin ? 'Node.js (execute.js)' : 'Unknown');
        
        if (!fs.existsSync(resolvedPluginPath)) {
            const errorMsg = '[ELECTRON-PLUGIN] ERROR: Plugin path not found: ' + resolvedPluginPath;
            F.writeLogToFile(errorMsg);
            console.error(errorMsg);
            app.quit();
            process.exit(1);
        }
        
        if (isNodePlugin) {
            // Node.js plugin mode - launch application.js with LANSUPERV_PLUGIN_EXECUTE
            // This is for plugins like "check" that run as Node.js processes
            const applicationPath = F.determineScriptPath({ scriptName: 'application.js', app: app, callerDirname: __dirname });
            
            const pluginEnv = { ...process.env };
            // LANSUPERV_PLUGIN_EXECUTE is already set in pluginEnv
            
            const childProcess = spawn('node', [applicationPath], {
                stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
                env: pluginEnv,
                shell: false
            });
            
            // Forward stdout/stderr
            if (childProcess.stdout) {
                childProcess.stdout.on('data', (data) => {
                    console.log('[PLUGIN]', data.toString().trim());
                });
            }
            if (childProcess.stderr) {
                childProcess.stderr.on('data', (data) => {
                    console.error('[PLUGIN-ERROR]', data.toString().trim());
                });
            }
            
            // Forward IPC messages between parent (server) and child (plugin)
            // Parent -> Child: forward messages from server to plugin
            if (typeof process.send === 'function') {
                process.on('message', (msg) => {
                    if (childProcess && !childProcess.killed && typeof childProcess.send === 'function') {
                        childProcess.send(msg);
                    }
                });
            }
            
            // Child -> Parent: forward messages from plugin to server
            childProcess.on('message', (msg) => {
                if (typeof process.send === 'function') {
                    process.send(msg);
                }
            });
            
            childProcess.on('exit', (code) => {
                F.writeLogToFile('[ELECTRON] Plugin process exited with code: ' + code);
                app.quit();
            });
            
            childProcess.on('error', (error) => {
                const errorMsg = '[ELECTRON-PLUGIN] ERROR launching plugin: ' + error.message;
                F.writeLogToFile(errorMsg);
                console.error(errorMsg);
                app.quit();
                process.exit(1);
            });
            
            // Exit early - don't load main app modules or start server
            // The plugin process will handle everything
        } else if (isElectronPlugin) {
            // Electron plugin mode - load plugin app.js directly
            // This is for plugins like "screen-joke" that create Electron windows
            const resolvedPluginPath = path.resolve(pluginAppPath);
            F.writeLogToFile('[ELECTRON] Electron plugin mode detected, loading plugin app: ' + resolvedPluginPath);
            console.log('[ELECTRON] Electron plugin mode detected, loading plugin app:', resolvedPluginPath);
            console.log('[ELECTRON] Original plugin path:', pluginAppPath);
            
            if (!fs.existsSync(resolvedPluginPath)) {
                const errorMsg = '[ELECTRON-PLUGIN] ERROR: Plugin app path not found: ' + resolvedPluginPath + ' (original: ' + pluginAppPath + ')';
                F.writeLogToFile(errorMsg);
                console.error(errorMsg);
                app.quit();
                process.exit(1);
            }
            
            // Load and execute the plugin app.js
            // The plugin app.js will handle its own window creation
            try {
                require(resolvedPluginPath);
            } catch (error) {
                const errorMsg = '[ELECTRON-PLUGIN] ERROR loading plugin app: ' + error.message;
                F.writeLogToFile(errorMsg);
                F.writeLogToFile('[ELECTRON-PLUGIN] Stack: ' + error.stack);
                console.error(errorMsg);
                console.error('[ELECTRON-PLUGIN] Stack:', error.stack);
                app.quit();
                process.exit(1);
            }
            
            // Exit early - don't load main app modules or start server
            // The rest of this file should not execute
        }
    } else {
        // Normal mode - load application modules required by electron-entrypoint-main.js
        ElectronTray = require('./electron-tray');
        ElectronUpdater = require('./electron-updater-config');
        ElectronNotifications = require('./electron-notifications');
        ElectronAutoStart = require('./electron-auto-start');
    }
} catch (error) {
    F.writeLogToFile('ERROR loading modules: ' + error.message);
    F.writeLogToFile('ERROR stack: ' + error.stack);
    throw error;
}

// If we're in plugin mode, don't execute the rest of the file
if (isPluginMode) {
    // Plugin mode - exit early, plugin will handle everything
    // Don't execute any of the main app initialization code below
} else {
    // Load and initialize main app with dependencies :
    const mainEntryPath = path.join(__dirname, 'electron-entrypoint-main.js');
    const initializeMainApp = require(mainEntryPath);
    initializeMainApp({
        app,
        BrowserWindow,
        spawn,
        ElectronTray,
        ElectronUpdater,
        ElectronNotifications,
        ElectronAutoStart
    });
}
