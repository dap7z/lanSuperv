// This is free and unencumbered software released into the public domain.
// See LICENSE for details

const log = require('electron-log');
const {app, BrowserWindow, Menu, protocol, ipcMain} = require('electron');
const {fork} = require('child_process');

// AutoLaunch
const AutoLaunch = require('auto-launch');
var lanSupervAutoLauncher = new AutoLaunch({
    name: 'lanSuperv'
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




//-------------------------------------------------------------------
// Check if graphic interface is available or not
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
    case 'win32':
        console.log('...win32...');
        break;
    default:
        console.log('Unknow platform: '+ process.platform);

}






let win, childProcess, headLess;


//-------------------------------------------------------------------
// Window that displays the version and working update
//-------------------------------------------------------------------
function statusMessage(text) {
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


function startApplication(){
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
}



var StandaloneAutoUpdater = require('auto-updater');

var autoUpdater = new StandaloneAutoUpdater({
    pathToJson: '',
    autoupdate: false,
    checkgit: true,
    jsonhost: 'raw.githubusercontent.com',
    contenthost: 'codeload.github.com',
    progressDebounce: 0,
    devmode: false
});

// State the events
autoUpdater.on('git-clone', function() {
    // .git folder detected...
    statusMessage("You have a clone of the repository. Use 'git pull' to be up-to-date");
});
autoUpdater.on('check.up-to-date', function(v) {
    statusMessage("You have the latest version: " + v);
    startApplication();
});
autoUpdater.on('check.out-dated', function(v_old, v) {
    statusMessage("Your version is outdated. " + v_old + " of " + v);
    autoUpdater.fire('download-update'); // If autoupdate: false, you'll have to do this manually.
    // Maybe ask if the'd like to download the update.
});
autoUpdater.on('update.downloaded', function() {
    statusMessage("Update downloaded and ready for install");
    autoUpdater.fire('extract'); // If autoupdate: false, you'll have to do this manually.
});
autoUpdater.on('update.not-installed', function() {
    statusMessage("The Update was already in your folder! It's read for install");
    autoUpdater.fire('extract'); // If autoupdate: false, you'll have to do this manually.
});
autoUpdater.on('update.extracted', function() {
    statusMessage("Update extracted successfully!");
    statusMessage("RESTART THE APP!");
    //TODO
});
autoUpdater.on('download.start', function(name) {
    statusMessage("Starting downloading: " + name);
});
autoUpdater.on('download.progress', function(name, perc) {
    process.stdout.write("Downloading " + perc + "% \033[0G");
});
autoUpdater.on('download.end', function(name) {
    statusMessage("Downloaded " + name);
});
autoUpdater.on('download.error', function(err) {
    statusMessage("Error when downloading: " + err);
});
autoUpdater.on('end', function() {
    statusMessage("The app is ready to function");
});
autoUpdater.on('error', function(name, e) {
    statusMessage(name, e);
});








//-------------------------------------------------------------------
// Application
//-------------------------------------------------------------------
app.on('ready', function() {
   // Check for update at launch (before show GUI)
   autoUpdater.fire('check');


  // Try open a window, if it fail app still works in head less mode
  headLess = false;
  try{
      // Create the Menu
      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
      // Create window
      createDefaultWindow(function(){
          statusMessage('Checking for update...');
      });
  }catch(error){
    headLess = true;
    log.info(error);
    log.info("headLess mode");
  }


});


app.on('window-all-closed', () => {
  //app.quit();
  console.log('app has to stay running in background');
});
