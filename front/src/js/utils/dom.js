/**
 * Utilitaires DOM pour remplacer jQuery
 */

/**
 * Sélectionne un élément par ID
 */
export function $(selector) {
    if (typeof selector === 'string') {
        if (selector.startsWith('#')) {
            return document.getElementById(selector.substring(1));
        }
        // Pour compatibilité, retourner querySelector
        return document.querySelector(selector);
    }
    return selector;
}

/**
 * Sélectionne plusieurs éléments
 */
export function $$(selector) {
    return document.querySelectorAll(selector);
}

/**
 * Vérifie si un élément a une classe
 */
export function hasClass(element, className) {
    return element && element.classList && element.classList.contains(className);
}

/**
 * Ajoute une classe
 */
export function addClass(element, className) {
    if (element && element.classList) {
        element.classList.add(className);
    }
}

/**
 * Retire une classe
 */
export function removeClass(element, className) {
    if (element && element.classList) {
        element.classList.remove(className);
    }
}

/**
 * Toggle une classe
 */
export function toggleClass(element, className) {
    if (element && element.classList) {
        element.classList.toggle(className);
    }
}

/**
 * Animation fadeOut simple
 */
export function fadeOut(element, duration = 300, callback) {
    if (!element) return;
    
    element.style.transition = `opacity ${duration}ms`;
    element.style.opacity = '0';
    
    setTimeout(() => {
        if (callback) callback();
    }, duration);
}

/**
 * Animation fadeIn simple
 */
export function fadeIn(element, duration = 300, callback) {
    if (!element) return;
    
    element.style.opacity = '0';
    element.style.display = '';
    element.style.transition = `opacity ${duration}ms`;
    
    // Force reflow
    element.offsetHeight;
    
    element.style.opacity = '1';
    
    setTimeout(() => {
        if (callback) callback();
    }, duration);
}

/**
 * Scroll smooth vers le bas
 */
export function scrollToBottom(element) {
    if (element) {
        element.scrollTo({
            top: element.scrollHeight,
            behavior: 'smooth'
        });
    }
}
