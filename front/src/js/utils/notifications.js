/**
 * Système de notifications utilisant Notyf (remplace Toastr)
 * Notyf est une bibliothèque légère (~2KB) sans dépendances jQuery
 */

import { Notyf } from 'notyf';
// CSS importé dans view.html

// Configuration Notyf avec positionnement en haut à droite et couleurs similaires à Toastr
let notyfInstance = null;

/**
 * Initialise Notyf si pas déjà fait
 */
function getNotyf() {
    if (!notyfInstance) {
        notyfInstance = new Notyf({
            position: {
                x: 'right',
                y: 'top',
            },
            duration: 5000, // 5 secondes comme Toastr
            ripple: true,
            dismissible: true,
            types: [
                {
                    type: 'success',
                    background: '#28a745', // Vert Bootstrap (identique à Toastr)
                    icon: {
                        className: 'notyf__icon--success',
                        tagName: 'i',
                    },
                },
                {
                    type: 'error',
                    background: '#dc3545', // Rouge Bootstrap (identique à Toastr)
                    icon: {
                        className: 'notyf__icon--error',
                        tagName: 'i',
                    },
                },
                {
                    type: 'info',
                    background: '#17a2b8', // Bleu Bootstrap (identique à Toastr)
                    icon: {
                        className: 'notyf__icon--info',
                        tagName: 'i',
                    },
                },
                {
                    type: 'warning',
                    background: '#ffc107', // Jaune Bootstrap (identique à Toastr warning)
                    icon: {
                        className: 'notyf__icon--warning',
                        tagName: 'i',
                    },
                },
            ],
        });
    }
    return notyfInstance;
}

/**
 * Affiche une notification de succès
 */
export function success(message, options = {}) {
    const notyf = getNotyf();
    // Notyf accepte du HTML dans les messages
    notyf.success(message);
}

/**
 * Affiche une notification d'erreur
 */
export function error(message, options = {}) {
    const notyf = getNotyf();
    notyf.error(message);
}

/**
 * Affiche une notification d'information
 */
export function info(message, options = {}) {
    const notyf = getNotyf();
    notyf.open({
        type: 'info',
        message: message,
    });
}

/**
 * Affiche une notification d'avertissement
 */
export function warning(message, options = {}) {
    const notyf = getNotyf();
    notyf.open({
        type: 'warning',
        message: message,
    });
}

/**
 * Compatibilité avec Toastr (pour migration progressive)
 */
export const toastr = {
    success: success,
    error: error,
    info: info,
    warning: warning
};
