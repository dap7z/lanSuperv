/******************************************************************************
                    LAUNCH THIS APP WITH: electron app.js
 (get error if you try: node app.js, cannot read property 'on' of undefined)
 
 sources: https://github.com/electron/simple-samples
******************************************************************************/

const {app, BrowserWindow} = require('electron')
const fs = require('fs') // for lock file
const path = require('path')
const url = require('url')

let mainWindow = null
let appInitialized = false
let lockFileWatcher = null
const lockFile = path.join(__dirname, '.screen-joke-lock.json')
let lastOptionsTimestamp = 0

function createWindow() {
  // Si une fenêtre existe déjà, la fermer d'abord
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close()
    mainWindow = null
  }
  
  // Create a new window
  mainWindow = new BrowserWindow({
    // Don't show the window until it ready, this prevents any white flickering
    show: false,
    // Make the window transparent
    transparent: true,
    // Remove the frame from the window
    frame: false,
	resizable: false,
    movable: false,
    titleBarStyle: 'hidden-inset',
    alwaysOnTop: true,
    kiosk: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      //devTools: true
    }
  })
  
  // Vider le cache avant de charger la page
  mainWindow.webContents.session.clearCache(() => {
    console.log('Cache vidé')
  })
  
  // Écouter les messages IPC pour fermer la fenêtre
  const { ipcMain } = require('electron')
  ipcMain.on('close-screen-joke-window', () => {
    console.log('Fermeture de la fenêtre demandée depuis le renderer')
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close()
    }
  })
  
  // Open devtools for diag
  // mainWindow.webContents.openDevTools()

  // Lire les options de l'événement depuis l'environnement
  let eventOptions = {};
  if (process.env.LANSUPERV_PLUGIN_OPTIONS) {
    try {
      eventOptions = JSON.parse(process.env.LANSUPERV_PLUGIN_OPTIONS);
      console.log('Event options reçues:', eventOptions);
    } catch (e) {
      console.warn('Erreur lors du parsing des options:', e);
    }
  }
  
  // Load a URL in the window to the local index.html path
  const htmlPath = url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  })
  
  // Ajouter les options dans l'URL pour les transmettre à window.js
  let urlParams = 't=' + Date.now();
  if (eventOptions.type) {
    urlParams += '&type=' + encodeURIComponent(eventOptions.type);
  }
  if (eventOptions.loop) {
    urlParams += '&loop=' + encodeURIComponent(eventOptions.loop);
  }
  
  // Add timestamp and options to prevent caching
  mainWindow.loadURL(htmlPath + '?' + urlParams)

  // Show window when page is ready
  mainWindow.once('ready-to-show', () => {
    //mainWindow.maximize() //V1
    mainWindow.setKiosk(true) //Mode kiosk pour forcer le focus et masquer la barre des tâches
    mainWindow.setSkipTaskbar(true) //Masquer de la barre des tâches
    mainWindow.show()
  })
  
  // Let the user close the window, or not.
  mainWindow.preventClose = false;
  // The event 'close' is called when a close button is clicked.
  mainWindow.on('close', function(e){
    if(mainWindow.preventClose){
    	e.preventDefault()
    	console.log('prevented execution of mainWindow close event');
    }
  });
  // Events 'before-quit' and 'close' are called when the OS is shutdown.
  app.on('before-quit', function (e) {
    if(mainWindow.preventClose){
    	e.preventDefault()
    	console.log('prevented execution of app before-quit event');
		
    }
  });
  mainWindow.on('minimize', function(e){
	e.preventDefault() //NOK
	console.log('prevented execution of mainWindow minimize event');
	mainWindow.show(); //required on windows10
  });
  
  // Nettoyer la référence quand la fenêtre est fermée
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function updateWindowWithNewOptions() {
  // Vérifier le fichier de verrouillage pour de nouvelles options
  if (!fs.existsSync(lockFile)) {
    return
  }
  
  try {
    const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
    
    // Vérifier si ce sont de nouvelles options (timestamp plus récent)
    if (lockData.timestamp && lockData.timestamp > lastOptionsTimestamp) {
      lastOptionsTimestamp = lockData.timestamp
      
      // Si la fenêtre existe, la fermer et en créer une nouvelle avec les nouvelles options
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log('Nouvelles options détectées, mise à jour de la fenêtre...')
        mainWindow.close()
        mainWindow = null
        
        // Attendre un peu que la fenêtre se ferme
        setTimeout(() => {
          // Mettre à jour les variables d'environnement avec les nouvelles options
          if (lockData.options) {
            process.env.LANSUPERV_PLUGIN_OPTIONS = JSON.stringify(lockData.options)
          }
          createWindow()
        }, 100)
      }
    }
  } catch (e) {
    console.warn('Erreur lors de la lecture du fichier de verrouillage:', e)
  }
}

function startLockFileWatcher() {
  // Surveiller le fichier de verrouillage pour détecter de nouvelles options
  if (fs.existsSync(lockFile)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
      if (lockData.timestamp) {
        lastOptionsTimestamp = lockData.timestamp
      }
    } catch (e) {
      // Ignorer l'erreur
    }
  }
  
  // Surveiller les changements du fichier
  lockFileWatcher = fs.watchFile(lockFile, { interval: 500 }, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
      updateWindowWithNewOptions()
    }
  })
}

// Wait until the app is ready
app.once('ready', () => {
  // Empêcher l'initialisation multiple
  if (appInitialized) {
    console.log('App plugin screen-joke déjà initialisée...')
    return
  }
  appInitialized = true
  
  // Mettre à jour le fichier de verrouillage avec le PID réel du processus Electron
  // (le fichier peut avoir été créé par execute.js avec pid: 0)
  try {
    let eventOptions = {};
    if (process.env.LANSUPERV_PLUGIN_OPTIONS) {
      try {
        eventOptions = JSON.parse(process.env.LANSUPERV_PLUGIN_OPTIONS);
      } catch (e) {
        // Ignorer l'erreur
      }
    }
    
    // Lire le fichier existant s'il existe, sinon créer un nouveau
    let lockData = {};
    if (fs.existsSync(lockFile)) {
      try {
        lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      } catch (e) {
        // Ignorer l'erreur, on créera un nouveau fichier
      }
    }
    
    // Mettre à jour avec le PID réel et supprimer le flag launching
    lockData.pid = process.pid;
    lockData.options = eventOptions;
    lockData.timestamp = Date.now();
    delete lockData.launching; // Supprimer le flag temporaire
    
    fs.writeFileSync(lockFile, JSON.stringify(lockData), 'utf8');
    lastOptionsTimestamp = lockData.timestamp;
    console.log(`Fichier de verrouillage mis à jour avec PID: ${process.pid}`);
  } catch (e) {
    console.warn('Erreur lors de la mise à jour du fichier de verrouillage:', e);
  }
  
  createWindow()
  startLockFileWatcher()
})

// Nettoyer le watcher quand l'app se ferme
app.on('will-quit', () => {
  if (lockFileWatcher) {
    fs.unwatchFile(lockFile)
    lockFileWatcher = null
  }
  
  // Supprimer le fichier de verrouillage
  try {
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile)
    }
  } catch (e) {
    // Ignorer l'erreur
  }
})
