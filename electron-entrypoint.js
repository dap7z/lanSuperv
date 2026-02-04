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
// If LANSUPERV_PLUGIN_APP_JS is set, we're launching a plugin, not the main app
const pluginAppPath = process.env.LANSUPERV_PLUGIN_APP_JS;
const isPluginMode = !!pluginAppPath;

try {
    const electron = require('electron');
    app = electron.app;
    BrowserWindow = electron.BrowserWindow;
    
    // Use cross-spawn for better Windows path handling (spaces, special characters)
    spawn = require('cross-spawn');
    
    if (isPluginMode) {
        // We're in plugin mode - act as plugin entry point
        // Resolve the plugin path to absolute path to ensure it works in both dev and compiled modes
        const resolvedPluginPath = path.resolve(pluginAppPath);
        F.writeLogToFile('[ELECTRON] Plugin mode detected, loading plugin app: ' + resolvedPluginPath);
        console.log('[ELECTRON] Plugin mode detected, loading plugin app:', resolvedPluginPath);
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
    // Plugin mode - exit early, plugin app.js will handle everything
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
