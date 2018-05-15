// This is free and unencumbered software released into the public domain.
// See LICENSE for details


//const {app, BrowserWindow, Menu, protocol, ipcMain} = require('electron');
//var app, BrowserWindow, Menu, protocol, ipcMain;

const {fork} = require('child_process');

// AutoLaunch
const AutoLaunch = require('auto-launch');
var lanSupervAutoLauncher = new AutoLaunch({
    name: 'lanSuperv',
    path: process.execPath //optionnal when start with electron .
});
lanSupervAutoLauncher.enable();
lanSupervAutoLauncher.isEnabled()
	.then(function(isEnabled){
		if(isEnabled){
			return;
		}
		lanSupervAutoLauncher.enable();
	}).catch(function(err){
		// handle error
	});

const log = require('electron-log');
//const {autoUpdater} = require("electron-updater");
const autoUpdater = require("electron-updater").autoUpdater;
console.log(autoUpdater);;

//-------------------------------------------------------------------
// Logging
//-------------------------------------------------------------------
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App initialization...');



    log.transports.file.level = "debug"
    autoUpdater.logger = log
    autoUpdater.checkForUpdates()


//-------------------------------------------------------------------
// Menu
//-------------------------------------------------------------------
let template = []
switch(process.platform){
	case 'darwin':
  
  // OS X
  const name = app.getName();
  template.unshift({
    label: name,
    submenu: [
      {
        label: 'About ' + name,
        role: 'about'
      },
      {
        label: 'Quit',
        accelerator: 'Command+Q',
        click() { app.quit(); }
      },
    ]
  })

	break;
	case 'linux':

//Detect if it's command line server or not :
const exec = require('child_process').exec;
const testscript = exec('sh isDesktop.sh /.');


testscript.stdout.on('data', function(data){
    console.log('data from isDeskyop.sh: ', data);
    // sendBackInfo();
});


	break;
	default:
		console.log('Unknow platform: '+ process.platform);

}



let win, childProcess, headLess;


//-------------------------------------------------------------------
// Window that displays the version and working update
//-------------------------------------------------------------------
function sendStatusToWindow(text) {
  if(win){
      win.webContents.send('message', text);
  }
  text += ' (displayOnWindow)';
  log.info(text);
}

function createDefaultWindow(callback) {
  win = new BrowserWindow({show: false});
  win.on('closed', () => {
    win = null;
  });
  win.loadURL(`file://${__dirname}/main.html#v${app.getVersion()}`);
  win.once('ready-to-show', () => {
      win.show();
      if(typeof callback === 'function'){
          callback();
      }
  });
  return win;
}

autoUpdater.on('checking-for-update', () => {
  sendStatusToWindow('Checking for update...');
});
autoUpdater.on('update-available', (info) => {
  sendStatusToWindow('Update available.');
});
autoUpdater.on('update-not-available', (info) => {
  sendStatusToWindow('Update not available, app is starting...');
  //[Start the real application]
  //Due to compatibility issues, We cant: require('./app').start();
  //To isolate from updater, we have to launch an app only process:
  childProcess = require('child_process').fork('./app.js');
  childProcess.on('message', (data) => {
      //console.log('/!\\ Message received from childProcess: ', data);
      if(win){
          if (typeof data.type !== 'undefined'){
              win.webContents.send(data.type, data);
          }else{
              win.webContents.send('message', data);
          }
      }
  });





});
autoUpdater.on('error', (err) => {
  sendStatusToWindow('Error in auto-updater. ' + err);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  sendStatusToWindow(log_message);
});
autoUpdater.on('update-downloaded', (info) => {
  sendStatusToWindow('Update downloaded; will install in 5 seconds');
});


//-------------------------------------------------------------------
// Auto updates
//
// https://github.com/electron-userland/electron-builder/wiki/Auto-Update#events
// The app doesn't need to listen to any events except `update-downloaded`
//-------------------------------------------------------------------
autoUpdater.on('update-downloaded', (info) => {
  // Wait 5 seconds, then quit and install
  setTimeout(function() {
    autoUpdater.quitAndInstall();  
  }, 5000)
})


//-------------------------------------------------------------------
// Application
//-------------------------------------------------------------------

// Try with GUI, if it fail app still works in head less mode
//headLess = false;
headLess = true;  //tmp
if(headLess==false)
{
  try{
    const {app, BrowserWindow, Menu, protocol, ipcMain} = require('electron');
  }catch(error){
    headLess = true;
    log.info(error);
    log.info("headLess mode");
  }
}



// Check for update at launch (before show GUI)
//autoUpdater.checkForUpdates();


/*
if(headLess == false){
var {app, BrowserWindow, Menu, protocol, ipcMain} = require('electron');

app.on('ready', function() {

	console.log('1111111111');
	autoUpdater.checkForUpdates();
	console.log('2222222222');
	log.info('3333333333...');


  // Create the Menu
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  // Create window
  createDefaultWindow(function(){
    sendStatusToWindow('Checking for update... OoO');
  });


});


//app.on('window-all-closed', () => {
//  app.quit();
//});
//app has to stay running in background

}
*/

