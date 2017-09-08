function clientJS(){
    
    console.log( Config.val('SOCKET_URL') );
    console.log( Config.val('PATH_EVENTS') );
    
    //connect to server nodejs server :
    socket = io.connect(Config.val('SOCKET_URL'), {path: Config.val('PATH_EVENTS')}, function(){
        console.log('socket connected');
    });

    var gun = Gun( Config.val('SOCKET_URL_DATABASE') );
    var tableName = Config.val('TABLE_COMPUTERS');
    var dbComputers = gun.get(tableName);

    dbComputers.map().on(function(pc, id) {
        //.val exec one time | .on exec at every change 

        if(id=='' || id==tableName){
            return true; //ignore root element
        }

        var $elem = $('#' + id);
        if(!$elem.get(0)){
            $elem = $('#pcModel').find('.pcElem').clone(true).attr('id', id).appendTo('#pcList');
            console.log('#'+ id +' not found => model has been cloned');
        }
        $elem.find('.nickname').text(pc.nickname);
        $elem.find('.hostname').text(pc.hostname);
        $elem.find('.lanIP').text(pc.lanIP);
        $elem.find('.lanMAC').text(pc.lanMAC);

        if(pc.online){
            $elem.find(".card-header").addClass("online");
        }else{
            $elem.find(".card-header").removeClass("online");
        }
        
        /*
        //TODO:
        console.log(pc.plugins);
        pc.plugins.map().on(function(plugin, id) {
            //ERROR: pc.plugins.map is not a function
            console.log("TODO");
            console.log(plugin);
        });
        */
        //si pas possible avec gun/path:
        //pluginWOL
        //pluginPOWER-OFF //impossible


        $('#loader').hide();
    });

}


//=========== function ===========
function sendRequest(btn, req){
    target = {};
    target.lanMAC = $(btn).closest(".pcElem").find(".lanMAC").html()
    
    socket.emit(req, target);
    alert(req +' command send to '+target.lanMAC);
    
    //TODO: show return result from socket
}



    //[--autres actions necessites serveur installe sur PC Cible
        //socket.emit('powerOff');
        //socket.emit('hardwareInfos');
        //socket.emit('internetProxy');
        //socket.emit('messanger');
        //socket.emit('receiveFile');
        //socket.emit('executeFile');
        //socket.emit('remoteControl');

    //]
