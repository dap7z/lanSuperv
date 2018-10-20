let F = require(__dirname + '/functions'); //FONCTIONS
let G = null; //GLOBALS

const Fs = require('fs');
const Path = require('path');


class ServerPluginsInfos {

    constructor(G_ref) {
        G = G_ref;
    }

    //QuickScan: only previously visibles computers
    //LanScan: map ping on whole lan primary interface


    static getDirectories(p){
        let dirs =  Fs.readdirSync(p).filter(function (file) {
            return Fs.statSync(p+'/'+file).isDirectory();
        });
        let dirsPaths = [];
        dirs.map(function (dir) {
            dirsPaths.push(Path.join(p, dir));
        });
        return dirsPaths;
    }


    static getPlugins(type='all',result='dirPath', format='object'){
        let results;
        let pluginsDirPath;
        let pluginsDirName;
        switch(type){
            case 'all':
                let remoteRequestsPlugins = this.getDirectories(__dirname+'/plugins/remote-requests/');
                let localResponsesPlugins = this.getDirectories(__dirname+'/plugins/local-responses/');
                pluginsDirPath = remoteRequestsPlugins.concat(localResponsesPlugins);
                break;
            case 'remote':
                pluginsDirPath = this.getDirectories(__dirname+'/plugins/remote-requests/');
                break;
            case 'local':
                pluginsDirPath = this.getDirectories(__dirname+'/plugins/local-responses/');
                break;
            default:
                pluginsDirPath = '';
        }

        //get results :
        if(result==='dirName'){
            pluginsDirName = [];
            pluginsDirPath.forEach(function(dirPath) {
                pluginsDirName.push(Path.basename(dirPath));
            });
            results = pluginsDirName;
        }else{
            results = pluginsDirPath;
        }
        //format results :
        if(format==='object'){
            //array to object for gun.js compatibility
            let obj = {};
            let pluginsId = 0;
            results.forEach(function(key) {
                pluginsId += 1;
                obj['plugin'+pluginsId] = key;
            });
            results = obj;
        }
        return results;
    }


    build(){
        let tabResult = [];
        let plugins = ServerPluginsInfos.getPlugins('all', 'dirPath', 'array');
        plugins.map(function (dirPath) {
            let eventName = Path.basename(dirPath);	//pluginDirName
            let isRemote = (dirPath.indexOf('remote') > -1);
            let execPath = '';
            let exec = Fs.readdirSync(dirPath).filter(function (elm) {
                return elm.match(/execute\.*/g);
            });

            if (exec.length === 1) {
                execPath = dirPath + Path.sep + exec;
                tabResult[eventName] = {
                    dirPath: dirPath,
                    execPath: execPath,
                    isRemote: isRemote,
                };
            }

            let diagPluginDetection = true;
            if (diagPluginDetection) {
                let logMsg = '[PLUGIN ' + eventName + '] file: ';
                if (execPath !== '') {
                    logMsg += execPath;
                }
                else {
                    logMsg += dirPath + Path.sep + 'execute.* ERROR_NOT_FOUND';
                }
                console.log(logMsg);
            }
        });
        return tabResult;
    }




};


module.exports = ServerPluginsInfos;