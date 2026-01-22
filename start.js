//THAT FILE IS ONLY FOR TEST PURPOSES
//INSTALL APPLICATION WITH lan-superv-launcher (npm package)

const path = require('path');

const LanSuperv = require('./module.js');
app = new LanSuperv();

//let ConfigFile = __dirname + '/config.js'; //ORG DEV //TODO REMOVE IF OK
// Utiliser CONFIG_FILE de l'environnement si défini (Docker), sinon config.js local
let configFileAbsolutePath = process.env.CONFIG_FILE || path.join(process.cwd(), '/config.js');
app.startApplication(configFileAbsolutePath);