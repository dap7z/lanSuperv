
//LIBRARIES
const Os = require('os');
const Util = require('util');
const Exec = require('child_process').exec;
const ExecPromise = Util.promisify(Exec);
let F = require('../back/functions.js'); //FONCTIONS

//CONSTANTES
const OS_WINDOWS = 'Windows_NT';
const OS_LINUX = 'Linux';
const OS_MAC = 'Darwin';
const EVENT_SCAN_RESPONSE = 'scanResponse';
const EVENT_SCAN_COMPLETE = 'scanComplete';
const EVENT_DEVICE_INFOS = 'deviceInfos';
const EVENT_DEVICES_INFOS = 'devicesInfos';


class TestDeviceName {
    constructor(options) {
        // Initialisation des propriétés comme dans LanDiscovery
        this.verbose = false;
        this.timeout = 10;
        if (options) {
            if(options.verbose) {
                this.verbose = options.verbose;
            }
            if(options.timeout) {
                if (options.timeout < 1 || options.timeout > 60) {
                    throw new Error(`Invalid timeout: ${options.timeout}. Please choose a timeout between 1 and 60s`);
                } else {
                    this.timeout = parseInt(options.timeout) || options.timeout.toFixed(0);
                }
            }
        }
        this.osType = Os.type();
        switch(this.osType){
            case OS_WINDOWS : break;
            case OS_LINUX : break;
            case OS_MAC : break;
            default : throw new Error('Unsupported OS: ' + this.osType);
        }
    }

    async deviceName(ip) {
        return new Promise((resolve) => {
            //F.validateParamIp(ip);
            let exe = 'host';
            let flag = '-W='+this.timeout;
            if(this.osType === OS_WINDOWS){
                exe = 'nslookup';
                flag = '-timeout='+this.timeout;
            }
            let args = [exe, flag];
            args.push(ip);
            let command = args.join(' ');
            if(this.verbose) console.log('command: ' + command);

            ExecPromise(command).then( (commandResult) => {
                if(commandResult.stderr){
                    throw new Error(commandResult.stderr);
                }
                let hostname = null;
                let rows = commandResult.stdout.split('\n');

                switch(this.osType){
                    case OS_WINDOWS :
                        if(rows.length>3){
                            //On windows, we can only rely on line number to parse hostname
                            //nslookup -timeout=60 192.168.1.66
                            //Name :    redminote2-redmi-13.home
                            //Nom :    redminote2-redmi-13.home
                            //... depending on windows language
                            hostname = rows[3].trim()
                                .replace(/\s+/g, ' ')
                                .split(' ')
                                .pop();
                        }
                        break;
                    case OS_LINUX :
                    case OS_MAC :
                        //On debian command "host 192.168.1.10" output :
                        //10.1.168.192.in-addr.arpa domain name pointer pc-damien.home.
                        //(host command is also available on Mac OS)
                        hostname = rows[0].trim() //first row
                            .replace(/\s+/g, ' ')
                            .split(' ')
                            .pop()
                            .slice(0,-1); // remove final point
                        break;
                }

                resolve(hostname);
            }).catch( (error) => {
                if(this.verbose) console.error('ERROR: ', error);
                //WINDOWS 7 : ERROR:  Error: *** UnKnown ne parvient pas à trouver 192.168.1.22 : Non-existent domain
                resolve(null);
            });
        });
    }

    async testDeviceName(ipTest){
        let name = await this.deviceName(ipTest);
        console.log('------------ TEST DEVICE NAME -----------------');
        console.log(ipTest + " name is :", name);
    }
}

// Exécution avec les paramètres
const test = new TestDeviceName({ verbose: true, timeout: 10 });
test.testDeviceName('10.10.1.200');
