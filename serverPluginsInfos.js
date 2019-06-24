//LIBRARIES:
const Fs = require('fs');
const Path = require('path');


class ServerPluginsInfos {

    constructor() {
        //no need G/G_ref here (and used into functions.js so cant be)
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


    static getPluginsDirPath(type='all'){
        let pluginsDirPath;
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
        return pluginsDirPath;
    }


    static build(){
        let tabResult = [];
        let plugins = ServerPluginsInfos.getPluginsDirPath('all');
        plugins.map(function (dirPath) {
            let execPath = '';  //used diagPluginDetection too
            let eventName = Path.basename(dirPath);	//pluginDirName
            let isRemote = (dirPath.indexOf('remote') > -1);
            tabResult[eventName] = {
                dirPath: dirPath,
                execPath: execPath,
                isRemote: isRemote,
                isEnabled: false,
            };

            let exec = Fs.readdirSync(dirPath).filter(function (elm) {
                return elm.match(/execute\.*/g);
            });
            if (exec.length === 1) {
                execPath = dirPath + Path.sep + exec;
                tabResult[eventName].execPath = execPath;
                tabResult[eventName].isEnabled = true;
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