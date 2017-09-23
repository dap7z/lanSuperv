function clientJS(){
    
    //use bootstrap popover on dynamically generated element :
    $(document).on('mouseenter', '.cutword', function(){
        if($(this).hasClass('popover-initialized') == false)
        {
            if($(this).text().trim() != '')
            {
                $(this).addClass('clickable');
                $(this).popover({
                    html : true,
                    container: 'body',
                    placement: 'top',
                    trigger: 'click',
                    content: function(){
                      return $(this).html();
                    }
                });
            }
            $(this).addClass('popover-initialized');
        }
    });
    
    
    //use bootstrap drowpdown as select :
    $(document).on("click", function(event){
        var $elem = $(event.target);
        //click anywhere on document :
        if($elem.hasClass('popover-initialized') == false)
        {
            var hasAnyPopoverClass = false;
            var classes = $elem.attr('class').split(' ');
            for(var i = 0; i < classes.length; i++) {
                if(classes[i].indexOf('popover') == 0){
                   hasAnyPopoverClass = true;
                }
            }
            
            //close all popover:
            if(!hasAnyPopoverClass){
                $('.popover-initialized').popover('hide');
            }
        }
        //click on li inside .dropdown-menu :
        if(event.target.nodeName.toLowerCase() == 'li')
        {
            if($elem.closest(".dropdown-menu").length > 0)
            {
                var selText = $elem.text();
                $elem.parents('.btn-group').find('.btn-plugin-value').html(selText);
            }
        }
    });
    

    
    //connect to server nodejs server :
    socket = io.connect(Config.val('SOCKET_URL'), {path: Config.val('PATH_SOCKET_EVENTS')}, function(){
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
            //clone the model if $('#'+id) not found
            $elem = $('#pcModel').find('.pcElem').clone(true).attr('id', id).appendTo('#pcList');
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
                var htmlObj = $dataContainer.get(0);
                if(htmlObj.hasAttribute('alt')){
                    //htmlObj.alt = pc[key];    //NOK
                    $dataContainer.attr('alt', pc[key]);
                }
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
    var reqData = {
        eventName: $pc.find('.btn-plugin-value').text(),
        pcTarget: {
            lanMAC: $pc.find(".lanMAC").html(),
            machineID: $pc.find(".machineID").html()
        }
    };
    
    socket.emit('pluginRequest', reqData);
    alert(reqData.eventName +' command send to '+ reqData.pcTarget.lanMAC);
    
    //TODO: show return result from socket
}
