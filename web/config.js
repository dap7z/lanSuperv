// Common configuration between client and server (file location: web/config.js)
var CONFIG = new Array();

//-------- START CONFIGURATION BLOCK --------
CONFIG['APP_AUTO_UPDATE'] = true;       //NEXTS RELEASES
CONFIG['APP_AUTO_START'] = true;        //NEXTS RELEASES


CONFIG['DATABASE_NAME'] = 'db12';   //change string to reset data

CONFIG['SERVER_ADDRESS'] = '';
//'' or 'http://localhost'    //AS DEFAULT (create a new gun.js database for each installed application)
//'https://lan.dapo.fr.cr'    //SHARED GUN.JS DATABASE

CONFIG['SERVER_PORT'] = 842;
CONFIG['SOCKET_PORT'] = 842;
CONFIG['SERVER_BEHIND_REVERSE_PROXY'] = true;

CONFIG['PATH_HTTP_EVENTS'] = '/cmd';              //example: http://localhost:842/cmd/power-off
CONFIG['PATH_DATABASE'] = '/gun';                 //default: '/gun'   //20170901 gun.js does not allow custom path

CONFIG['NMAP_LOCATION'] = 'nmap';   //default
CONFIG['NMAP_LOCATION'] = 'C:/Program Files (x86)/Nmap/nmap.exe';       //windows

CONFIG['GUN_ADDITIONAL_PEERS'] = [];
CONFIG['GUN_ADDITIONAL_PEERS'] = ['https://lan.dapo.fr.cr/gun'];
//GUN_ADDITIONAL_PEERS is empty by default => no link between servers
//You can hosts and add one or some urls in this table, example:
//['https://main-server-domain.com/gun', 'http://2nd-without-reverse-proxy.fr:842/gun']
//-------- END CONFIGURATION BLOCK --------



//======================================================================================================================
// Set default config :
if(CONFIG['SERVER_ADDRESS'] == ''){
    CONFIG['SERVER_ADDRESS'] = 'http://localhost';
}
CONFIG['LOCAL_DATABASE'] = (CONFIG['SERVER_ADDRESS'].indexOf("localhost") >- 1);


// Check if client or server side :
if((typeof module != 'undefined')&&(typeof module.exports != 'undefined'))
{
    //nodejs plugin system detected
    CONFIG['CLIENT_SIDE'] = false;

}
else
{
    CONFIG['CLIENT_SIDE'] = true;

    if(CONFIG['LOCAL_DATABASE']){
        //(gun.js web client have address the MAIN_SERVER_ADDRESS)

        //get server address from browser and update SERVER_ADDRESS :
        var host = window.location.host;
        if(host=='') host = 'localhost';
        var protocol = window.location.protocol;
        if(protocol=='') protocol = 'http:';
        CONFIG['SERVER_ADDRESS'] = protocol + '//'+ host;
    }
    //remove ports if reverse proxy listening on 80/443:
    if(CONFIG['SERVER_BEHIND_REVERSE_PROXY']){
        CONFIG['SERVER_PORT'] = '';
        CONFIG['SOCKET_PORT'] = '';
    }
}


// Config.val() function available on client.js and server.js
var config_object = {
    val : function(varName){
        var error = '';
        var verbose = false;
        var result = '';
        if(CONFIG.hasOwnProperty(varName))
        {
           result = CONFIG[varName];
        }
        else
        {
            //calculated wich multiples config property
            switch(varName){
                case 'SERVER_URL':
                    result = this.val('SERVER_ADDRESS');
                    if(this.val('SERVER_PORT') != ''){
                        result += ':'+ this.val('SERVER_PORT'); 
                    }
                    break;
                case 'SOCKET_URL':
                    result = this.val('SERVER_ADDRESS');
                    if(this.val('SOCKET_PORT') != ''){
                        result += ':'+ this.val('SOCKET_PORT'); 
                    }
                    break;
                case 'SERVER_URL_EVENTS':
                    result = this.val('SERVER_URL') + this.val('PATH_HTTP_EVENTS');
                    break;
                case 'SOCKET_URL_DATABASE':
                    result = this.val('SOCKET_URL') + this.val('PATH_DATABASE');
                    break;
                case 'TABLE_COMPUTERS':
                    result = this.val('DATABASE_NAME') +'/computers';
                    break;
                case 'TABLE_MESSAGES':
                    result = this.val('DATABASE_NAME') +'/messages';
                    break;
                case 'FILE_SHARED_DB':
                    result = this.val('DATABASE_NAME') +'-shared.json';
                    break;
                case 'FILE_LOCAL_DB':
                    result = this.val('DATABASE_NAME') +'-local.json';
                    break;
				case 'GUN_PEERS':
					result = [this.val('SOCKET_URL_DATABASE')]; //array
					CONFIG['GUN_ADDITIONAL_PEERS'].forEach(function(url) {
						if(url !== result[0]){
							result.push(url);
						}
					});
					break;

                default:
                    error = '[ERROR] ';
                    result = false;
            }
        }
        if(error!='' || verbose) console.log(error+"GET CONFIG "+varName+": '"+ result +"'");

        return result;
    }
};


//function declaration :
if(config_object.val('CLIENT_SIDE'))
{
    //use as include in index.html / client.js
    Config = config_object;
}
else
{
    //use as module with require in nodejs server.js
    module.exports = config_object;
}

