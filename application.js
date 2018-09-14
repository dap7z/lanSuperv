//=============//
// ENTRY POINT //
//=============//

var argv = require('yargs').argv;

//START APPLICATION WORKERS
require('./server').start(argv.config);