'use strict';

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

        //OLD NOK WITH PKG
        //this.childProcess = fork(__dirname+'/application.js', ['--config='+ConfigFile]);

        //NEW (https://github.com/zeit/pkg/issues/251)
        const path = require('path');
        let modulePath = path.join(__dirname,'application.js');
        this.childProcess = fork(modulePath, ['--config='+ConfigFile]);

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