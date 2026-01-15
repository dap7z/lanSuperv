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
        this.childProcess = null;
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