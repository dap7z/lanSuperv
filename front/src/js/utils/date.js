/**
 * Utilitaires de formatage de dates utilisant dayjs
 */
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

// Étendre dayjs avec le plugin relativeTime
dayjs.extend(relativeTime);

/**
 * Format a date in relative format (ex: "2 minutes ago")
 */
export function formatRelativeTime(dateString) {
    if (!dateString) return '';
    const d = dayjs(dateString);
    return d.fromNow();
}

/**
 * Met à jour un élément time avec formatage relatif
 * Remplace $time.timeago()
 */
export function updateTimeElement(timeElement, dateString) {
    if (!timeElement || !dateString) return;
    
    // Utiliser data-timestamp pour la compatibilité avec updateAllTimeAgo()
    timeElement.setAttribute('data-timestamp', dateString);
    timeElement.setAttribute('datetime', dateString);
    timeElement.textContent = formatRelativeTime(dateString);
}

/**
 * Met à jour tous les éléments avec la classe .timeago
 * Lit depuis l'attribut data-timestamp ou datetime
 */
export function updateAllTimeAgo() {
    document.querySelectorAll('.timeago').forEach(el => {
        // Lire depuis data-timestamp en priorité, sinon depuis datetime
        const timestamp = el.dataset.timestamp || el.getAttribute('datetime');
        if (timestamp) {
            const d = dayjs(timestamp);
            el.textContent = d.fromNow();
        }
    });
}
