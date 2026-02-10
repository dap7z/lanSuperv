//=============//
//===================================== ENTRY POINT =====================================//                                                                         //                                                                    
// COMPILED SEA : Binaire SEA → application-sea.js → execution direct de application.js  //
// COMPILED Electron : Binaire electron → start.js → module.js → fork(application.js)    //
//=======================================================================================//

const path = require('path');
const fs = require('fs');

//GET COMMAND PARAMETERS
// In SEA binary mode, process.argv[1] might be the binary path again, so we need to handle this
let argv = require('yargs')(process.argv.slice(1)).argv;

// Check if we're in plugin mode by checking if LANSUPERV_PLUGIN_EXECUTE is set
const scriptPath = process.env.LANSUPERV_PLUGIN_EXECUTE;

console.log(`[APPLICATION.JS] application.js executed with LANSUPERV_PLUGIN_EXECUTE = ${scriptPath || 'undefined'}`);

if (scriptPath) {
        const resolvedPath = path.isAbsolute(scriptPath) ? scriptPath : path.join(process.cwd(), scriptPath);
        
        // Check if the file exists
        if (!fs.existsSync(resolvedPath)) {
            console.error(`[APPLICATION.JS] ERROR: Script file not found: ${resolvedPath}`);
            process.exit(1);
        }
        
        // Check if this is a plugin execute.js file (plugins listen for IPC messages)
        // Use normalized path to handle both / and \ separators
        const normalizedPath = resolvedPath.replace(/\\/g, '/');
        const isPluginExecute = normalizedPath.includes('/plugins/') && path.basename(resolvedPath) === 'execute.js';
        
        if (isPluginExecute) {
            // This is a plugin, execute it directly in plugin mode
            // The plugin will listen for IPC messages via process.on('message')
            console.log(`[APPLICATION.JS] Executing plugin: ${resolvedPath}`);
            
            // Verify that IPC is available (process.send should exist)
            if (typeof process.send !== 'function') {
                console.error(`[APPLICATION.JS] ERROR: IPC not available. Plugin requires IPC communication.`);
                console.error(`[APPLICATION.JS] Make sure the plugin is spawned with stdio option including 'ipc'`);
                process.exit(1);
            }
            
            try {
                require(resolvedPath);
                // Plugin will wait for IPC messages, don't exit immediately
                // The parent process (execute.test.js) will send messages via child.send()
            } catch (error) {
                console.error(`[APPLICATION.JS] Error executing plugin:`, error);
                process.exit(1);
            }
            // Don't return, let the plugin run and wait for IPC messages
            
            // :) WORKING ON RASPBERRY PI (ARM64) http://localhost:842/cmd/check
        } else {
            // This is a test script or other script, execute it directly
            console.log(`[APPLICATION.JS] Executing script: ${resolvedPath}`);
            try {
                require(resolvedPath);
            } catch (error) {
                console.error(`[APPLICATION.JS] Error executing script:`, error);
                process.exit(1);
            }
            // Exit after script execution (script should handle its own lifecycle)
            return;
        }
}
else //LANSUPERV_PLUGIN_EXECUTE is not set so we are not in plugin mode.
{
    //1) INIT APPLICATION
    const Server = require('./back/server.js');
    let lanSupervServer = new Server(argv.config);

    //2) START APPLICATION
    lanSupervServer.start();
}
