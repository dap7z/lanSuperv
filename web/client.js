function clientJS(){
    
    
    //use bootstrap drowpdown as select :
     $(document).on("click", ".dropdown-menu li", function(){
      var selText = $(this).text();
      $(this).parents('.btn-group').find('.btn-plugin-value').html(selText);
    });
    
    
    //connect to server nodejs server :
    socket = io.connect(Config.val('SOCKET_URL'), {path: Config.val('PATH_EVENTS')}, function(){
        console.log('socket connected');
    });

    var gun = Gun( Config.val('SOCKET_URL_DATABASE') );
    var tableName = Config.val('TABLE_COMPUTERS');
    var dbComputers = gun.get(tableName);

    dbComputers.map().on(function(pc, id) {
        //.val exec one time | .on exec at every change
        
        var wolPlugin = 'wol';
        var powerOffPlugin = 'power-off';
        var powerOffAvailable = false;

        if(id=='' || id==tableName){
            return true; //ignore root element
        }

        var $elem = $('#' + id);
        if(!$elem.get(0)){
            $elem = $('#pcModel').find('.pcElem').clone(true).attr('id', id).appendTo('#pcList');
            console.log('#'+ id +' not found => model has been cloned');
        }
        
        //online status
        if(pc.online){
            $elem.find(".card-header").addClass("onlinePc");
        }else{
            $elem.find(".card-header").removeClass("onlinePc");
        }
        
        var $pluginList = $elem.find('.btn-plugin-choice').find('.dropdown-menu');
        $pluginList.html(''); //empty plugin list of this pc
        
        for (var key in pc){
            var $dataContainer = $elem.find('.'+key);
            //pc description
            if($dataContainer.length > 0){
                //update html (.hostname/.lanIP/.lanMAC/...)
                $dataContainer.text(pc[key]);
            }
            //plugins availables
            else if(key.startsWith("plugin")){
                var pluginName = pc[key];
                $pluginList.append('<li class="dropdown-item">'+ pluginName +'</li>');
                if(pluginName==powerOffPlugin){
                   powerOffAvailable = true;
                }
            }
        }
        
        //selected plugin
        var defaultPlugin = 'wol';
        if(pc.online && powerOffAvailable){
           defaultPlugin = powerOffPlugin;
        }
        $elem.find('.btn-plugin-value').text(defaultPlugin);

        $('#loader').hide();
    });

}


//=========== function ===========
function sendRequest(btn){
    var $pc =  $(btn).closest(".pcElem");
    
    target = {};
    target.lanMAC = $pc.find(".lanMAC").html()
    
    var req = $pc.find('.btn-plugin-value').text();
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
