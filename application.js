//=============//
//===================================== ENTRY POINT =====================================//                                                                         //                                                                    
// COMPILED SEA : Binaire SEA → application-sea.js → execution direct de application.js  //
// COMPILED Electron : Binaire electron → start.js → module.js → fork(application.js)    //
//=======================================================================================//

const path = require('path');
const fs = require('fs');

//GET COMMAND PARAMETERS
let argv = require('yargs').argv;

if (process.env.LANSUPERV_PLUGIN_MODE === 'true') {
    // Look for a JavaScript file in arguments
    const scriptArg = process.argv[2];
    if (scriptArg && scriptArg.endsWith('.js')) {
        const scriptPath = path.isAbsolute(scriptArg) ? scriptArg : path.join(process.cwd(), scriptArg);
        
        // Check if the file exists
        if (fs.existsSync(scriptPath)) {
            // Check if this is a plugin execute.js file (plugins listen for IPC messages)
            const isPluginExecute = scriptPath.includes('/plugins/') && path.basename(scriptPath) === 'execute.js';
            
            if (isPluginExecute) {
                // This is a plugin, execute it directly in plugin mode
                // The plugin will listen for IPC messages via process.on('message')
                console.log(`[APPLICATION.JS] Executing plugin: ${scriptPath}`);
                
                // Verify that IPC is available (process.send should exist)
                if (typeof process.send !== 'function') {
                    console.error(`[APPLICATION.JS] ERROR: IPC not available. Plugin requires IPC communication.`);
                    console.error(`[APPLICATION.JS] Make sure the plugin is spawned with stdio option including 'ipc'`);
                    process.exit(1);
                }
                
                try {
                    require(scriptPath);
                    // Plugin will wait for IPC messages, don't exit immediately
                    // The parent process (execute.test.js) will send messages via child.send()
                } catch (error) {
                    console.error(`[APPLICATION.JS] Error executing plugin:`, error);
                    process.exit(1);
                }
                // Don't return, let the plugin run and wait for IPC messages
            } else {
                // This is a test script or other script, execute it directly
                console.log(`[APPLICATION.JS] Executing script: ${scriptPath}`);
                try {
                    require(scriptPath);
                } catch (error) {
                    console.error(`[APPLICATION.JS] Error executing script:`, error);
                    process.exit(1);
                }
                // Exit after script execution (script should handle its own lifecycle)
                return;
            }
        } else {
            console.error(`[APPLICATION.JS] ERROR: Script file not found: ${scriptPath}`);
            process.exit(1);
        }
    } else {
        console.error(`[APPLICATION.JS] ERROR: LANSUPERV_PLUGIN_MODE is set but no JavaScript file provided in arguments`);
        process.exit(1);
    }
}
// ELSE :

//1) INIT APPLICATION
const Server = require('./back/server.js');
let lanSupervServer = new Server(argv.config);

//2) START APPLICATION
lanSupervServer.start();