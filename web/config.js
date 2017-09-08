// Common configuration between client and server
// File path: web/config.js
// =======================================

// -- START CONFIG --
var ACCESS_FROM_REVERSE_PROXY = true;   //true or false
var DATABASE_NAME = 'db1';   //change string to reset data

var SERVER_ADDRESS = 'http://localhost';
var SERVER_PORT = 842;
var SOCKET_PORT = 842;

var PATH_EVENTS = '/events';    //default: '/socket.io'
var PATH_DATABASE = '/gun';     //default: '/gun'   //20170901 gun.js does not allow custom path
//-- END CONFIG --


// Check if client or server side :
var CLIENT_SIDE;
if((typeof module != 'undefined')&&(typeof module.exports != 'undefined'))
{
    //nodejs plugin system detected
    CLIENT_SIDE = false;
}
else
{
    CLIENT_SIDE = true;
    //get server address from browser :
    var host = window.location.host;
    if(host=='') host = 'localhost';
    var protocol = window.location.protocol;
    if(protocol=='') protocol = 'http:';
    SERVER_ADDRESS = protocol + '//'+ host;

    //remove ports if reverse proxy listening on 80/443:
    if(ACCESS_FROM_REVERSE_PROXY){
        SERVER_PORT = '';
        SOCKET_PORT = '';
    }
}


// Config.val() function available on client.js and server.js
var config_object = {
    val : function(varName){
        var error = '';
        var verbose = true;
        var result = '';
        switch(varName){
            case 'SERVER_ADDRESS':
                result = SERVER_ADDRESS;
                break;
            case 'SERVER_PORT':
                result = SERVER_PORT;
                break;
            case 'SERVER_URL':
                result = SERVER_ADDRESS;
                if(SERVER_PORT != ''){
                    result += ':'+ SERVER_PORT; 
                }
                break;
            case 'PATH_EVENTS':
                result = PATH_EVENTS;
                break;
            case 'PATH_DATABASE':
                result = PATH_DATABASE;
                break;
            case 'SOCKET_PORT':
                result = SOCKET_PORT;
                break;
            case 'SOCKET_URL':
                result = SERVER_ADDRESS;
                if(SOCKET_PORT != ''){
                    result += ':'+ SOCKET_PORT; 
                }
                break;
            case 'SOCKET_URL_EVENTS':
                result = this.val('SOCKET_URL') + PATH_EVENTS;
                break;
            case 'SOCKET_URL_DATABASE':
                result = this.val('SOCKET_URL') + PATH_DATABASE;
                break;
            case 'DATABASE_NAME':
                result = DATABASE_NAME;
                break;
            case 'TABLE_COMPUTERS':
                result = DATABASE_NAME +'/computers';
                break;
            case 'FILE_SHARED_DB':
                result = DATABASE_NAME +'-shared.json';
                break;
            //case 'FILE_LOCAL_DB':
            //    result = DATABASE_NAME +'-local.json';
            //    break;

            default:
                error = '[ERROR] ';
                result = false;
        }
        if(error!='' || verbose) console.log(error+"GET CONFIG "+varName+": '"+ result +"'");

        return result;
    }
};


//function declaration :
if(CLIENT_SIDE)
{
    //use as include in index.html / client.js
    Config = config_object;
}
else
{
    //use as module with require in nodejs server.js
    module.exports = config_object;
}

