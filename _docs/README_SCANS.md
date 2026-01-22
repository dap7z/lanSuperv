## Scanner Réseau (`serverLanScanner.js`)

Le scanner réseau est le cœur de la découverte des équipements. Il fonctionne en deux modes :

*   **Full Scan (Scan Complet)** :
    *   S'appuie sur la librairie `lan-discovery` (utilisation de requêtes ARP).
    *   Lance un scan sur toute la plage IP du sous-réseau détecté.
    *   Exécuté au démarrage et ensuite périodiquement (par défaut toutes les heures).
    *   Capture l'IP et l'adresse MAC des équipements.

*   **Quick Scan & Vérification Unitaire (`onePcScan`)** :
    *   Vérifie l'état d'un équipement spécifique.
    *   Utilise trois méthodes de détection quasi-simultanées :
        1.  **ICMP Ping** : Via `ping-bluebird`.
        2.  **Check HTTP** : Tente de joindre l'agent LanSuperv sur le port configuré (par défaut 842).
        3.  **Socket Check** : Envoi d'un message via Gun.js pour voir si l'agent répond.
    *   Met à jour les indicateurs `respondsTo-ping`, `respondsTo-http`, `respondsTo-socket`.
