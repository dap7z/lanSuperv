//THAT FILE IS ONLY FOR TEST PURPOSES
//INSTALL APPLICATION WITH lan-superv-launcher (npm package)

const path = require('path');

const LanSuperv = require('./module.js');
app = new LanSuperv();

//let ConfigFile = __dirname + '/config.js'; //ORG DEV //TODO REMOVE IF OK
// Use CONFIG_FILE from environment if defined (Docker), otherwise local config.js
const F = require('./back/functions');
let configDir = F.getAppDirectory();
let configFileAbsolutePath = process.env.CONFIG_FILE || path.join(configDir, 'config.js');
app.startApplication(configFileAbsolutePath);