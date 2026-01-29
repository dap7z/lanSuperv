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
        try {
            let dirs =  Fs.readdirSync(p).filter(function (file) {
                return Fs.statSync(Path.join(p, file)).isDirectory();
            });
            let dirsPaths = [];
            dirs.map(function (dir) {
                dirsPaths.push(Path.join(p, dir));
            });
            return dirsPaths;
        } catch (error) {
            console.error(`[PLUGINS] Error reading directory ${p}:`, error.message);
            return [];
        }
    }


    static getPluginsDirPath(type='all'){
        let pluginsDirPath;
        
        // Detect if we are in an executable and adjust the path
        let pluginsBasePath;
        const F = require('./functions');
        
        if (F.isAppCompiled()) {
            // In an executable (SEA), use the executable directory + back/plugins/
            pluginsBasePath = Path.join(Path.dirname(process.execPath), 'back', 'plugins');
        } else {
            // In development, __dirname already points to back/, so plugins/ directly
            pluginsBasePath = Path.join(__dirname, 'plugins');
        }
        
        switch(type){
            case 'all':
                let remoteRequestsPlugins = this.getDirectories(Path.join(pluginsBasePath, 'remote-requests'));
                let localResponsesPlugins = this.getDirectories(Path.join(pluginsBasePath, 'local-responses'));
                pluginsDirPath = remoteRequestsPlugins.concat(localResponsesPlugins);
                break;
            case 'remote':
                pluginsDirPath = this.getDirectories(Path.join(pluginsBasePath, 'remote-requests'));
                break;
            case 'local':
                pluginsDirPath = this.getDirectories(Path.join(pluginsBasePath, 'local-responses'));
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
            let execPath = '';
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

            let diagPluginDetection = false;
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