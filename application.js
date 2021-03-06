//=============//
// ENTRY POINT //
//=============//


//GET COMMAND PARAMETERS
let argv = require('yargs').argv;

//INIT APPLICATION
const Server = require('./server.js');
let lanSupervServer = new Server(argv.config);

//START APPLICATION
lanSupervServer.start();