/**
 * StateManager : Gestion simple de l'état pour remplacer Vue.js
 * Système de listeners pour la réactivité
 */
export class StateManager {
    constructor() {
        this.computers = new Map();
        this.messages = new Map();
        this.listeners = {
            computers: new Set(),
            messages: new Set()
        };
    }

    /**
     * Met à jour un ordinateur
     */
    updateComputer(id, data) {
        this.computers.set(id, data);
        this.notify('computers', id, data);
    }

    /**
     * Supprime un ordinateur
     */
    deleteComputer(id) {
        this.computers.delete(id);
        this.notify('computers', id, null);
    }

    /**
     * Met à jour un message
     */
    updateMessage(id, data) {
        this.messages.set(id, data);
        this.notify('messages', id, data);
    }

    /**
     * Supprime un message
     */
    deleteMessage(id) {
        this.messages.delete(id);
        this.notify('messages', id, null);
    }

    /**
     * S'abonner aux changements
     */
    subscribe(type, callback) {
        if (this.listeners[type]) {
            this.listeners[type].add(callback);
        }
    }

    /**
     * Se désabonner des changements
     */
    unsubscribe(type, callback) {
        if (this.listeners[type]) {
            this.listeners[type].delete(callback);
        }
    }

    /**
     * Notifier les listeners d'un changement
     */
    notify(type, id, data) {
        if (this.listeners[type]) {
            this.listeners[type].forEach(callback => {
                try {
                    callback(id, data);
                } catch (error) {
                    console.error(`[StateManager] Error in listener for ${type}:`, error);
                }
            });
        }
    }

    /**
     * Obtenir tous les ordinateurs
     */
    getAllComputers() {
        return Array.from(this.computers.entries()).map(([id, data]) => ({ id, ...data }));
    }

    /**
     * Obtenir tous les messages
     */
    getAllMessages() {
        return Array.from(this.messages.entries()).map(([id, data]) => ({ id, ...data }));
    }
}
