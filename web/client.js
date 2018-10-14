
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
            var attrClass = $elem.attr('class');
            if(attrClass) {
                var tabClass = attrClass.split(' ');
                for(var i = 0; i < tabClass.length; i++) {
                    if(tabClass[i].indexOf('popover') == 0){
                        hasAnyPopoverClass = true;
                    }
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

	
    localStorage.clear();
    var gunPeers = Config.val('GUN_PEERS');
    console.log("gunPeers: ", gunPeers);
    sharedObject.gun = new Gun(gunPeers);
    var tableName = Config.val('TABLE_COMPUTERS');
    var dbComputers = sharedObject.gun.get(tableName);
	
	
    dbComputers.map().on(function(pc, id) {

        //.val exec one time | .on exec at every change
        //console.log("dbComputers has been updated, we have to update the view");

        var wolPlugin = 'wol';
        var powerOffPlugin = 'power-off';
        var powerOffAvailable = false;

        if(id=='' || id==tableName){
            return true; //ignore root element
        }

        //LASTDEV
        if(typeof(pc.hostname) == 'undefined'){
             //console.log("WARNING clearGunDatabase not totaly remove pc :");
             //console.log(pc);
             return true; //ignore "removed" gun.js entry //see clearGunDatabase()
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

        //hide some badges if app is not installed :
        var $badges = $elem.find(".badge.requireApp");
        if(pc.machineID){
            $badges.show();
        }else{
            $badges.hide();
        }


        var $pluginList = $elem.find('.btn-plugin-choice').find('.dropdown-menu');
        $pluginList.html(''); //empty plugin list of this pc

        for (var key in pc){
            var $dataContainer = $elem.find('.'+key);
            //badges respondsTo
            if($dataContainer.hasClass("badge")){
                if(pc[key]){
                    $dataContainer.removeClass("badge-default");
                    $dataContainer.addClass("badge-success");
                }else{
                    $dataContainer.removeClass("badge-success");
                    $dataContainer.addClass("badge-default");
                }
            }
            //lastResponse
            else if(key == "lastResponse"){
                var $time = $dataContainer.find("time").first();
                $time.attr("datetime", pc[key]);
                $time.timeago(); //has to be called after datetime change
                //(first page loading: load database value of previous scan)
                //TODO: fix refresh on gun.js computer.lastResponse update
            }
            //pc description
            else if($dataContainer.length > 0){
                //update html (.hostname/.lanIP/.lanMAC/...)
                $dataContainer.text(pc[key]);
                var htmlObj = $dataContainer.get(0);
            }
            //plugins availables
            else if(key.startsWith("plugin")){
                var pluginName = pc[key];
                if(pluginName !== null){
                    $pluginList.append('<li class="dropdown-item">'+ pluginName +'</li>');
                    if(pluginName==powerOffPlugin){
                        powerOffAvailable = true;
                    }
                }
            }
        }

        //selected plugin
        var defaultPlugin = wolPlugin;
        if(pc.online && powerOffAvailable){
           defaultPlugin = powerOffPlugin;
        }
        $elem.find('.btn-plugin-value').text(defaultPlugin);

        $('#loader').hide();
    });

    //Events notifications
    var pageLoadedAt = new Date().toISOString();
    var lastNotification = '';

    sharedObject.dbMessages = sharedObject.gun.get(Config.val('TABLE_MESSAGES'));

    sharedObject.dbMessages.map().on(function(eventData, id) {
        if(eventData && eventData.eventSendedAt){
            if(pageLoadedAt < eventData.eventSendedAt && lastNotification != eventData.eventResult)
            {
                lastNotification = eventData.eventResult; //fix double notification
                //caused by two gun.js 0.8 database update separated by few ms (.eventReceivedAt and then .eventResult)
                //... make .on() function called twice with filled .eventResult

                response = JSON.parse(lastNotification);

                var informations = '';
                informations += 'Event '+ eventData.eventName +', target :';
                if(eventData.pcTargetLanMAC){
                    informations += '<br>[lanMAC] '+ eventData.pcTargetLanMAC;
                }
                if(eventData.pcTargetMachineID){
                    informations += '<br>[MachineID] '+ eventData.pcTargetMachineID;
                }
                if(response.msg){
                    informations += '<br>'+ response.msg;
                }

                toastr.success(informations);
            }
        }
    });

}


//==================== function ======================
function clearGunDatabase(){
    //https://github.com/amark/gun/wiki/Delete
    //sharedObject.gun.get(Config.val('TABLE_COMPUTERS')).put(null); //NOK

    var emptyCompList = {};
    sharedObject.gun.get(Config.val('TABLE_COMPUTERS')).put(emptyCompList);
    sharedObject.gun.get(Config.val('TABLE_COMPUTERS')).val(function(result){
        console.log(result);
    });

    sharedObject.gun.get(Config.val('TABLE_MESSAGES')).put(null);

    //Other way, more complicated :
    // - localStorage.clear() in every browser
    // - stop the server
    // - rm data.json on server

    //The only way that actually works :
    // - stop server, close browsers
    // - change DATABASE_NAME in config.js
    // - remove visibleComputers.json
    // - restart server and browser
}


function sendGunMessage(message){
    console.log("execute function sendGunMessage() with msg:");
    console.log(message);
    sharedObject.dbMessages.set(message);
}


function sendRequest(btn){
    var $pc =  $(btn).closest(".pcElem");
    var reqData = {
        eventName: $pc.find('.btn-plugin-value').text(),
        eventResult: '',
        eventSendedAt: new Date().toISOString(),
        eventReceivedAt: null,
        pcTargetLanMAC: $pc.find(".lanMAC").html(),
        pcTargetMachineID: $pc.find(".machineID").html(),
    };
    //gun.js cant handle JS multiple dimensions objects, only key:value.

    reqData.who = localStorage.getItem('userName'); //uname
    sendGunMessage(reqData);
}



//=========== polyfill for IE compatibility ============
//String.startsWith()
if (!String.prototype.startsWith) {
    String.prototype.startsWith = function(searchString, position){
        position = position || 0;
        return this.substr(position, searchString.length) === searchString;
    };
}



