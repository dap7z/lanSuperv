//=============//
// ENTRY POINT //
//=============//

//const path = require('path');

//GET COMMAND PARAMETERS
let argv = require('yargs').argv;

//INIT APPLICATION
const Server = require('./back/server.js');
let lanSupervServer = new Server(argv.config);

//START APPLICATION
lanSupervServer.start();