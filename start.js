//THAT FILE IS ONLY FOR TEST PURPOSES
//INSTALL APPLICATION WITH lan-superv-launcher (npm package)

const LanSuperv = require('./module.js');
app = new LanSuperv();

var ConfigFile = __dirname + '/config.js';
app.startApplication(ConfigFile);