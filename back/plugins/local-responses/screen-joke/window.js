// Run this function after the page has loaded
document.addEventListener('DOMContentLoaded', () => {
  const video = document.querySelector('video')

  // Récupérer le type et l'option loop depuis l'URL (paramètre de requête)
  const urlParams = new URLSearchParams(window.location.search)
  const type = urlParams.get('type') || 'webcam-mirror' // Par défaut: webcam-mirror
  const loop = urlParams.get('loop') || 'no' // Par défaut: no (pas de boucle, fermeture à la fin)
  
  console.log('Type de screen-joke:', type)
  console.log('Option loop:', loop)

  // Fonction pour charger une vidéo spécifique depuis le dossier videos
  function loadSpecificVideo(videoName, shouldLoop) {
    // Construire le chemin vers la vidéo dans le dossier videos
    // videoName est le nom sans le préfixe "video-" (ex: "destroyed-screen")
    const videoPath = './videos/' + videoName + '.mp4'
    console.log('Chargement de la vidéo spécifique:', videoPath)
    console.log('Nom de la vidéo:', videoName)
    console.log('Chemin complet:', videoPath)
    console.log('URL actuelle:', window.location.href)
    
    // Gestion des erreurs de chargement
    video.onerror = (e) => {
      console.error('Erreur de chargement vidéo:', e)
      if (video.error) {
        console.error('Code d\'erreur vidéo:', video.error.code)
        console.error('Message d\'erreur:', video.error.message)
        // Codes d'erreur possibles :
        // 1 = MEDIA_ERR_ABORTED
        // 2 = MEDIA_ERR_NETWORK
        // 3 = MEDIA_ERR_DECODE
        // 4 = MEDIA_ERR_SRC_NOT_SUPPORTED
        const errorMessages = {
          1: 'MEDIA_ERR_ABORTED - Le chargement a été interrompu',
          2: 'MEDIA_ERR_NETWORK - Erreur réseau lors du chargement',
          3: 'MEDIA_ERR_DECODE - Erreur de décodage (format non supporté ou fichier corrompu)',
          4: 'MEDIA_ERR_SRC_NOT_SUPPORTED - Format non supporté'
        }
        console.error('Type d\'erreur:', errorMessages[video.error.code] || 'Inconnu')
      }
      console.error('État réseau:', video.networkState)
      console.error('État prêt:', video.readyState)
    }
    
    video.onloadstart = () => {
      console.log('Début du chargement de la vidéo:', videoPath)
    }
    
    video.onloadedmetadata = () => {
      console.log('Métadonnées chargées:', {
        duration: video.duration,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState
      })
    }
    
    video.oncanplay = () => {
      console.log('Vidéo prête à être lue')
    }
    
    video.oncanplaythrough = () => {
      console.log('Vidéo peut être lue sans interruption')
    }
    
    // Gérer la fin de la vidéo si loop = 'no'
    if (shouldLoop === 'no') {
      video.onended = () => {
        console.log('Vidéo terminée, fermeture de la fenêtre...')
        // Fermer la fenêtre Electron via IPC
        try {
          // Avec nodeIntegration: true, on peut utiliser require('electron')
          const { ipcRenderer } = require('electron')
          if (ipcRenderer) {
            ipcRenderer.send('close-screen-joke-window')
          } else {
            // Fallback: utiliser window.close()
            window.close()
          }
        } catch (e) {
          // Si require('electron') ne fonctionne pas, utiliser window.close()
          console.warn('Impossible d\'utiliser ipcRenderer, tentative avec window.close()')
          window.close()
        }
      }
      video.loop = false
    } else {
      video.loop = true
    }
    
    //video.muted = true //Nécessaire pour autoplay dans certains navigateurs
    video.src = videoPath
    video.play().catch((error) => {
      console.error('Erreur lors de la lecture de la vidéo :', error)
      console.error('Détails:', {
        code: video.error?.code,
        message: video.error?.message,
        networkState: video.networkState,
        readyState: video.readyState,
        src: video.src
      })
    })
  }

  // Utiliser l'API native du navigateur pour obtenir les dimensions de l'écran
  const screenWidth = window.screen.width
  const screenHeight = window.screen.height

  const constraints = {
    video: {
      width: {
        ideal: screenWidth // Ideal video width is size of screen
      },
      height: {
        ideal: screenHeight // Ideal video height is size of screen
      }
    }
  }

  // Comportement selon le type
  if (type.startsWith('video-')) {
    // Mode vidéo spécifique: charger la vidéo depuis le dossier videos
    // Le type est au format "video-xxx" où xxx est le nom du fichier sans extension
    const videoName = type.substring(6) // Enlever le préfixe "video-"
    console.log('Mode vidéo spécifique:', videoName)
    // L'option loop n'a d'impact que pour les vidéos, pas pour la webcam
    loadSpecificVideo(videoName, loop)
  } else { // unknow type or webcam-mirror
    // Pour la webcam, l'option loop n'a pas d'impact, la fenêtre reste ouverte
    let webcamActive = false
    let webcamTimeout = null
    let webcamTimeoutMS = 2000
    
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      console.log('Webcam détectée et activée')
      video.srcObject = stream
      video.play().catch((error) => {
        console.error('Erreur lors de la lecture du stream webcam:', error)
      })
      video.addEventListener('loadedmetadata', () => {
        webcamActive = true
        if (webcamTimeout) {
          clearTimeout(webcamTimeout)
          webcamTimeout = null
        }
      })
      video.addEventListener('playing', () => {
        webcamActive = true
        if (webcamTimeout) {
          clearTimeout(webcamTimeout)
          webcamTimeout = null
        }
      })
    }).catch((error) => {
      console.warn('Impossible d\'accéder à la webcam:', error)
    })
    webcamTimeout = setTimeout(() => {
      if (!webcamActive) {
      console.warn('Webcam toujours pas disponible après attente ' + webcamTimeoutMS + ' ms')
      }
    }, webcamTimeoutMS)
  }


})