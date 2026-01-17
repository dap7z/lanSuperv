@echo off
:: ================================================================================
:: LanSuperv Startup Script : lance l'application Node.js au démarrage
:: 
:: Comment le mettre en place dans le planificateur de taches ?
::   Win + R, tapez taskschd.msc
::   Créer une tâche
::   Onglet Général : Nommez-la "lanSuperv Startup", cochez Exécuter avec les privilèges les plus élevés, Masqué (pour arrière-plan).
::   Onglet Déclencheurs : Nouveau > A l'ouverture de session > Tout utilisateur > OK.
::   (Ou au demarrage et dansd l'onglet general cochez Exécuter même si l'utilisateur n'est pas connecté mais necessite d'enregistrer le mot de passe du compte à utiliser)
::   Onglet Actions : Nouveau > Démarrer un programme > Programme : chemin complet vers ce fichier (X:/Y/Z/start-lan-superv.bat)
::   Onglet Conditions : Décochez Démarrer la tâche uniquement si l'ordinateur est alimenté par le secteur. (si pc portable)
::   Onglet Paramètres : Décochez Arreter la tache si elle s'execute plus de : 3 jours
::   Enregistrez
:: ================================================================================

cd /d "%~dp0"
echo updated working directory : %CD%

call npm.cmd start

echo App running, press any key to exit...
pause > nul
