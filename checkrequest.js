const PluginName = 'poweroff';
const Request = require('request');

process.on('message', (url) => {
    
    
    try {
        
        // Set the headers
        var headers = {
            'User-Agent':       'LanSuperv Agent/1.0.0',
            'Content-Type':     'application/x-www-form-urlencoded'
        }
        // Configure the request
        var options = {
            url: url,
            method: 'GET',
            headers: headers
        }
        // Start the request
        Request(options, function (error, response, jsonResult) {
            if (!error && response.statusCode == 200) {
                process.send(jsonResult);
            }
        })
        
        
    } catch (e) {
        console.log('Catched error on reqCheck: ');
        console.log(e);
        //catch ECONNREFUSED or ETIMEDOUT ?
        //[ not with  require(http).request, may be with require(request) ]
    }
    
    
});