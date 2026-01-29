// Run this function after the page has loaded
document.addEventListener('DOMContentLoaded', () => {
  const video = document.querySelector('video')

  // Fonction pour charger la vidéo locale en fallback
  function loadLocalVideo() {
    // Utiliser un chemin relatif depuis le fichier HTML
    const videoPath = './video.mp4'
    console.log('Chargement de la vidéo locale:', videoPath)
    video.src = videoPath
    video.loop = true
    video.muted = true // Nécessaire pour autoplay dans certains navigateurs
    video.play().catch((error) => {
      console.error('Erreur lors de la lecture de la vidéo locale:', error)
      // Si même la vidéo locale échoue, afficher un message
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:#fff;font-size:24px;">Aucune source vidéo disponible</div>'
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

  // Essayer d'abord la webcam
  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    console.log('Webcam détectée et activée')
    video.srcObject = stream  // Play stream in <video> element
    video.onerror = () => {
      console.warn('Erreur avec la webcam, basculement sur vidéo locale')
      loadLocalVideo()
    }
  }).catch((error) => {
    console.warn('Impossible d\'accéder à la webcam:', error)
    console.log('Basculement sur la vidéo locale...')
    loadLocalVideo()
  })


})