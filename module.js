'use strict';

const {fork} = require('child_process');

/******************************************************
 lan-superv npm module, usage :
     const LanSuperv = require('./module.js');
     const app = new LanSuperv();
     app.startApplication();

 En compilation SEA, package.json a "main": "module.js"
 En compilation Electron package.json doit avoir "main": "electron-main.js"
 *****************************************************/

class LanSuperv {

    constructor() {
        this.childProcess = null;
    }

    startApplication(ConfigFile){
        console.log("== START APPLICATION == (ConfigFile:"+ ConfigFile +")");

        const fs = require('fs');
        const path = require('path');

        // Check if config.js exists, if not, copy config.js.sample to config.js
        if (!fs.existsSync(ConfigFile)) {
            fs.copyFileSync(ConfigFile+'.sample', ConfigFile);
            const warningMsg = 'WARNING! Fichier config.js non trouvé, initialisation avec ENABLE_SCAN=false et SERVER_ADDRESS=\'\'';
            console.log(warningMsg);
        }

        let modulePath = path.join(__dirname,'application.js');
        this.childProcess = fork(modulePath, ['--config='+ConfigFile]);

        if(this.childProcess)
        {
            this.childProcess.on('message', (data) => {
                console.log('/!\\ Message received from childProcess: ', data);
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