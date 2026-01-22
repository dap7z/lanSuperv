/**
 * Utilitaires de formatage de dates pour remplacer Moment.js et jQuery.timeago
 */

/**
 * Formate une date en format relatif (ex: "il y a 2 minutes")
 * Remplace moment().fromNow() et jQuery.timeago()
 */
export function formatRelativeTime(dateString, locale = 'fr') {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    if (Math.abs(diffSecs) < 60) {
        return rtf.format(-diffSecs, 'second');
    } else if (Math.abs(diffMins) < 60) {
        return rtf.format(-diffMins, 'minute');
    } else if (Math.abs(diffHours) < 24) {
        return rtf.format(-diffHours, 'hour');
    } else if (Math.abs(diffDays) < 7) {
        return rtf.format(-diffDays, 'day');
    } else if (Math.abs(diffWeeks) < 4) {
        return rtf.format(-diffWeeks, 'week');
    } else if (Math.abs(diffMonths) < 12) {
        return rtf.format(-diffMonths, 'month');
    } else {
        return rtf.format(-diffYears, 'year');
    }
}

/**
 * Met à jour un élément time avec formatage relatif
 * Remplace $time.timeago()
 */
export function updateTimeElement(timeElement, dateString) {
    if (!timeElement || !dateString) return;
    
    timeElement.setAttribute('datetime', dateString);
    timeElement.textContent = formatRelativeTime(dateString);
}
