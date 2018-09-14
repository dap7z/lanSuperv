'use strict';

const log = require('electron-log');
const {fork} = require('child_process');

/******************************************************
 lan-superv npm module, usage :
     const LanSuperv = require('./module.js');
     const app = new LanSuperv();
     app.startApplication();
 *****************************************************/

class LanSuperv {

    constructor() {
        this.win = null;
        this.childProcess = null;
        this.headLess = false;

        //-------------------------------------------------------------------
        // Check if graphic interface is available or not
        //-------------------------------------------------------------------
        let template = [];
        switch(process.platform){
            case 'darwin':

                //OS X
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

                //Linux (Ubuntu/Debian)
                // detect if it's command line server or not :
                const exec = require('child_process').exec;
                const testscript = exec('sh isDesktop.sh /.');


                testscript.stdout.on('data', function(data){
                    console.log('data from isDeskyop.sh: ', data);
                    // sendBackInfo();
                });

                break;
            case 'win32':

                //Windows
                console.log('...win32...');
                break;
            default:
                console.log('Unknow platform: '+ process.platform);

        }

        //END
        this.statusMessage("This is the constructor End !");
    }

    //-------------------------------------------------------------------
    // Window that displays the version and working update
    //-------------------------------------------------------------------
    statusMessage(text) {
        if(this.win){
            this.win.webContents.send('message', text);
        }
        text += ' (displayOnWindow)';
        console.log(text);
    }

    createDefaultWindow(callback) {
        this.win = new BrowserWindow({show: false});
        this.win.on('closed', () => {
            this.win = null;
        });
        this.win.loadURL(`file://${__dirname}/main.html#v${app.getVersion()}`);
        this.win.once('ready-to-show', () => {
            this.win.show();
            if(typeof callback === 'function'){
                callback();
            }
        });
    }


    startApplication(ConfigFile){
        console.log("== START APPLICAITON == (ConfigFile:"+ ConfigFile +")");

        //Due to compatibility issues, We cant: require(__dirname+'/cluster').start();
        //To isolate from updater, we have to launch an app only process:
        //this.childProcess = require('child_process').fork(__dirname+'/application.js');
        //this.childProcess = require('child_process').spawn(__dirname+'/application.js', {detached: true}); //NOK
        //this.childProcess = require('child_process').fork(__dirname+'/application.js', {detached:true});	 //OK LAUNCH NOK EXIT (BUT MULTIPLES LAUNCH, BUT NO CONSOLE LOG)
        this.childProcess = require('child_process').fork(__dirname+'/application.js', ['--config='+ConfigFile]);  //NOT DETACHED: OK LAUNCH (FIX MULTI LAUNCH ? not really, +1 process at every http request)
        if(this.childProcess)
        {
            this.childProcess.on('message', (data) => {
                console.log('/!\\ Message received from childProcess: ', data);
                if(this.win){
                    if (typeof data.type !== 'undefined'){
                        this.win.webContents.send(data.type, data);
                    }else{
                        this.win.webContents.send('message', data);
                    }
                }
            });
        }
        else
        {
            console.error('startApplication() error: this.childProcess == null');
        }
    }


    stopApplication(){
        if(this.childProcess){
            //process.kill(-this.childProcess.pid);
            this.childProcess.disconnect();
            this.childProcess.unref();

            //process.exit()
        }
    }

}


exports = module.exports = LanSuperv;


//TEST that class => http://localhost:842 OK
//let test = new LanSuperv();
//test.startApplication();








/*
//TEST SIMPLE EXPRESS
const express = require('express')
const justWait = express()
justWait.get('/', function (req, res) {
    res.send('Hello World!')
})
justWait.listen(3000, function () {
    console.log('Example app listening on port 3000!')
})
*/







//-------------------------------------------------------------------
// Electron application (Only if graphic display available)
//-------------------------------------------------------------------
/*

const {app, BrowserWindow, Menu, protocol, ipcMain} = require('electron');
app.on('ready', function() {
   // Check for update at launch (before show GUI)
   autoUpdater.fire('check');


  // Try open a window, if it fail app still works in head less mode
  try{
      // Create the Menu
      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
      // Create window
      createDefaultWindow(function(){
          statusMessage('Checking for update...');
      });
  }catch(error){
    this.headLess = true;
    log.info(error);
    log.info("headLess mode");
  }


});


app.on('window-all-closed', () => {
  //app.quit();
  console.log('app has to stay running in background');
});

*/

