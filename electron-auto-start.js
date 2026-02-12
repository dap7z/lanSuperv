/**
 * Electron Auto Start management
 * Handles automatic startup on system boot
 * On Windows: Uses Task Scheduler to run with administrator privileges
 * On Linux/macOS: Uses standard login items
 */

const { app } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

class ElectronAutoStart {
    constructor() {
        this.autoStartEnabled = false;
        this.taskName = 'lanSuperv-AutoStart';
    }
    
    init(config) {
        this.autoStartEnabled = config.autoStart || false;
        this.setAutoStart(this.autoStartEnabled);
    }
    
    setAutoStart(enabled) {
        this.autoStartEnabled = enabled;
        
        if (process.platform === 'win32') {
            // On Windows, use Task Scheduler to run with admin privileges
            this.setWindowsTaskScheduler(enabled);
        } else {
            // On Linux/macOS, use standard login items
            this.setStandardLoginItem(enabled);
        }
    }
    
    setWindowsTaskScheduler(enabled) {
        const execPath = process.execPath;
        const taskName = this.taskName;
        
        if (enabled) {
            // Create scheduled task that runs at logon with highest privileges
            // Note: Creating a task with /RL HIGHEST requires administrator privileges
            // The application must be run as administrator to create this task
            // Required for windows 11 by example : add quotes to executable paths with spaces 
            // Build the complete command as a single string to preserve quotes correctly
            const command = `schtasks /Create /TN "${taskName}" /TR "${execPath}" /SC ONLOGON /RL HIGHEST /F`;
            const childProcess = spawn(command, [], {
                shell: true,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            
            let stdout = '';
            let stderr = '';
            
            if (childProcess.stdout) {
                childProcess.stdout.on('data', (data) => {
                    stdout += data.toString();
                });
            }
            
            if (childProcess.stderr) {
                childProcess.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
            }
            
            childProcess.on('close', (code) => {
                if (code === 0) {
                    console.log(`[ELECTRON-AUTO-START] Windows task created successfully (path: ${execPath})`);
                } else {
                    console.error(`[ELECTRON-AUTO-START] Failed to create Windows task (exit code: ${code})`);
                    if (stderr) {
                        console.error(`[ELECTRON-AUTO-START] Error: ${stderr.trim()}`);
                    }
                    console.error('[ELECTRON-AUTO-START] Note: Creating a task with admin privileges requires running the application as administrator');
                    console.error('[ELECTRON-AUTO-START] Please run the application as administrator and try again');
                }
            });
        } else {
            // Delete the scheduled task
            const childProcess = spawn('schtasks', [
                '/Delete',
                '/TN', taskName,
                '/F'
            ], {
                shell: true,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            
            let stderr = '';
            
            if (childProcess.stderr) {
                childProcess.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
            }
            
            childProcess.on('close', (code) => {
                if (code === 0) {
                    //console.log(`[ELECTRON-AUTO-START] Windows task deleted successfully`);
                } else {
                    // Task might not exist, which is fine (exit code 1 is normal in this case)
                    // Check for various "does not exist" messages in different languages
                    const stderrLower = stderr.toLowerCase();
                    const taskNotExists = stderrLower.includes('does not exist') || 
                                        stderrLower.includes('n\'existe pas') ||
                                        stderrLower.includes('nicht vorhanden') ||
                                        code === 1; // Exit code 1 usually means task doesn't exist
                    
                    if (taskNotExists) {
                        //console.log(`[ELECTRON-AUTO-START] Windows task does not exist (already disabled or never created)`);
                    } else {
                        // Real error (not just "task doesn't exist")
                        console.log(`[ELECTRON-AUTO-START] Windows task deletion completed (exit code: ${code})`);
                        if (stderr) {
                            console.log(`[ELECTRON-AUTO-START] Details: ${stderr.trim()}`);
                        }
                    }
                }
            });
        }
    }
    
    setStandardLoginItem(enabled) {
        try {
            // Works for both installed and portable applications
            // On Linux: Creates .desktop file in ~/.config/autostart/
            // On macOS: Uses LaunchAgents
            app.setLoginItemSettings({
                openAtLogin: enabled,
                openAsHidden: false, // Start visible (tray icon will be shown)
                name: 'lanSuperv',
                path: process.execPath // Works with portable executables too
            });
            
            console.log(`[ELECTRON-AUTO-START] Auto start ${enabled ? 'enabled' : 'disabled'} (path: ${process.execPath})`);
        } catch (error) {
            console.error('[ELECTRON-AUTO-START] Error setting auto start:', error);
        }
    }
    
    isAutoStartEnabled() {
        if (process.platform === 'win32') {
            // On Windows, we can't easily check synchronously, so return the stored state
            // The actual state will be verified when the task is created/deleted
            return this.autoStartEnabled;
        } else {
            try {
                const loginItemSettings = app.getLoginItemSettings();
                return loginItemSettings.openAtLogin;
            } catch (error) {
                console.error('[ELECTRON-AUTO-START] Error getting auto start status:', error);
                return false;
            }
        }
    }
}

// Export singleton instance
const electronAutoStart = new ElectronAutoStart();

module.exports = {
    init: (config) => electronAutoStart.init(config),
    setAutoStart: (enabled) => electronAutoStart.setAutoStart(enabled),
    isAutoStartEnabled: () => electronAutoStart.isAutoStartEnabled()
};
