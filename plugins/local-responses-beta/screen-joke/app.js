/******************************************************************************
                    LAUNCH THIS APP WITH: electron app.js
 (get error if you try: node app.js, cannot read property 'on' of undefined)
 
 sources: https://github.com/electron/simple-samples
******************************************************************************/

const {app, BrowserWindow} = require('electron')
const path = require('path')
const url = require('url')


//== START ADD ==
const {ipcMain} = require('electron')
ipcMain.on('asynchronous-message', (event, arg) => {
	//console.log('ipcMain: close event received from browser window');
	//mainWindow.preventClose = false;
	//mainWindow.close();
	console.log('prevented execution of close event');
})
//== END ADD ==


let mainWindow = null

// Wait until the app is ready
app.once('ready', () => {
  // Create a new window
  mainWindow = new BrowserWindow({
    // Don't show the window until it ready, this prevents any white flickering
    show: false,
    // Make the window transparent
    transparent: true,
    // Remove the frame from the window
    frame: false,
	//== START ADD ==
	resizable: false,
    movable: false,
    titleBarStyle: 'hidden-inset',
	//== END ADD ==
  })

  // Load a URL in the window to the local index.html path
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Show window when page is ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })
  
  //== START ADD ==
  mainWindow.preventClose = true;
    //The event 'close' is called when a close button is clicked.
  mainWindow.on('close', function(e){
    if(mainWindow.preventClose){
    	e.preventDefault()
    	console.log('prevented execution of mainWindow close event');
    }
  });
  //Events 'before-quit' and 'close' are called when the OS is shutdown.
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
  //== END ADD ==
  
})
