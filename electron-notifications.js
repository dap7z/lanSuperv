/**
 * Electron Notifications management
 * Handles system notifications for updates
 */

const { Notification } = require('electron');
const path = require('path');
const fs = require('fs');

class ElectronNotifications {
    constructor() {
        this.iconPath = this.getIconPath();
    }
    
    init() {
        // Check if notifications are supported
        if (!Notification.isSupported()) {
            console.warn('[ELECTRON-NOTIFICATIONS] Notifications are not supported on this platform');
        }
    }
    
    getIconPath() {
        // Try to find icon in assets or front directory
        const iconPaths = [
            path.join(__dirname, 'assets', 'icon.png'),
            path.join(__dirname, 'front', 'favicon.ico'),
            path.join(__dirname, 'front', 'img', 'clear-all.png')
        ];
        
        for (const iconPath of iconPaths) {
            if (fs.existsSync(iconPath)) {
                return iconPath;
            }
        }
        
        return null; // Use default icon
    }
    
    notifyUpdateAvailable(version) {
        if (!Notification.isSupported()) {
            return;
        }
        
        const notification = new Notification({
            title: 'Mise à jour disponible',
            body: `Version ${version} est disponible. Téléchargement en cours...`,
            icon: this.iconPath,
            silent: false
        });
        
        notification.show();
    }
    
    notifyUpdateInstalled(version) {
        if (!Notification.isSupported()) {
            return;
        }
        
        const notification = new Notification({
            title: 'Mise à jour téléchargée',
            body: `La version ${version} de l'application a été téléchargée.`,
            icon: this.iconPath,
            silent: false
        });
        
        notification.show();
    }
    
    notifyError(title, message) {
        if (!Notification.isSupported()) {
            console.error(`[ERROR] ${title}: ${message}`);
            return;
        }
        
        const notification = new Notification({
            title: title,
            body: message,
            icon: this.iconPath,
            silent: false
        });
        
        notification.show();
    }
}

// Export singleton instance
const electronNotifications = new ElectronNotifications();

module.exports = {
    init: () => electronNotifications.init(),
    notifyUpdateAvailable: (version) => electronNotifications.notifyUpdateAvailable(version),
    notifyUpdateInstalled: (version) => electronNotifications.notifyUpdateInstalled(version),
    notifyError: (title, message) => electronNotifications.notifyError(title, message)
};
