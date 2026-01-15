//=========== polyfill for IE compatibility ============
//String.startsWith()
if (!String.prototype.startsWith) {
    String.prototype.startsWith = function(searchString, position){
        position = position || 0;
        return this.substr(position, searchString.length) === searchString;
    };
}
//=====================================================


export default class Client {

    constructor(functionSendMessage) {
        //CLASS ATTRIBUTS :
        this.functionSendMessage = functionSendMessage;
        //events notifications (before gunOnChangeDbMessages first call)
        this.pageLoadedAt = new Date().toISOString();
        this.lastNotification = '';
    }

    //MAIN METHOD :
    init(){
        let self = this;  //that reference to this ca be used inside sub function scope

        //use bootstrap popover on dynamically generated element :
        $(document).on('mouseenter', '.cutword', function(){
            let thisElement = this;
            if($(thisElement).hasClass('popover-initialized') === false)
            {
                if($(thisElement).text().trim() !== '')
                {
                    $(thisElement).addClass('clickable');
                    $(thisElement).popover({
                        html : true,
                        container: 'body',
                        placement: 'top',
                        trigger: 'click',
                        content: function(){
                            return $(this).html();
                        }
                    });
                }
                $(thisElement).addClass('popover-initialized');
            }
        });

        //use bootstrap drowpdown as select :
        $(document).on("click", function(event){
            let $elem = $(event.target);
            //click anywhere on document :
            if($elem.hasClass('popover-initialized') === false)
            {
                let hasAnyPopoverClass = false;
                let attrClass = $elem.attr('class');
                if(attrClass) {
                    let tabClass = attrClass.split(' ');
                    for(let i = 0; i < tabClass.length; i++) {
                        if(tabClass[i].indexOf('popover') === 0){
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
            if(event.target.nodeName.toLowerCase() === 'li')
            {
                if($elem.closest(".dropdown-menu").length > 0)
                {
                    let selText = $elem.text();
                    $elem.parents('.btn-group').find('.btn-plugin-value').html(selText);
                }
            }
        });


        let $clearAllMessages = $("#clearAllMessages");
        $clearAllMessages.on('click', function(){
            //prevent multiple click :
            $clearAllMessages.hide();
            window.setTimeout(function(){
                $clearAllMessages.show();
            }, 1000);

            //simulate click on all deletemsg btn :
            $('body').find('i.deletemsg').trigger('click');
        });


        $(".btn-plugin-submit").on('click', function(){
            let thisBtn = this;
            self.sendRequest(thisBtn);
        });
    }

    //OTHERS METHODS :
    sendRequest(btn){
        let $pc =  $(btn).closest(".pcElem");
        let reqData = {
            eventName: $pc.find('.btn-plugin-value').text(),
            eventResult: '',
            eventSendedAt: new Date().toISOString(),
            eventReceivedAt: null,
            pcTargetLanMAC: $pc.find(".lanMAC").html(),
            pcTargetMachineID: $pc.find(".machineID").html(),
            //-- chat.js --
            type: 'event', //(not text)
            who: localStorage.getItem('userName'), //uname
            when: new Date().toISOString(), //only for display time from now
            //-------------
        };
        //(gun.js cant handle JS multiple dimensions objects, only key:value)
        this.functionSendMessage(reqData);
    }

    //==START=ON=CHANGE=DB=COMPUTERS=====================================================================================
    gunOnChangeDbComputers(pc, id){
        //.once exec one time | .on exec at every change
        console.log("[CLIENT.JS] dbComputers has been updated, we have to update the view. function called with - id:", id, "pc:", pc);

        let wolPlugin = 'wol';
        let powerOffPlugin = 'power-off';
        let powerOffAvailable = false;

        //clear data :
        if(id==='' || id===Config.val('TABLE_COMPUTERS')){
            return true; //ignore root element
        }
        if(typeof(pc.hostname) === 'undefined'){
            return true; //ignore "removed" gun.js entry, clearGunDatabase() not totaly remove pc
        }

        //retrieve element or clone the model if not found
        let $elem = $('#' + id);
        if(!$elem.get(0)){
            $elem = $('#pcModel').find('.pcElem').clone(true).attr('id', id).appendTo('#pcList');
        }

        //hide some badges if app is not installed :
        let $badges = $elem.find(".badge.requireApp");
        if(pc.machineID){
            $badges.show();
        }else{
            $badges.hide();
        }

        let $pluginList = $elem.find('.btn-plugin-choice').find('.dropdown-menu');
        $pluginList.html(''); //empty plugin list of this pc

        let pcIsOnline = false;
        Object.entries(pc).forEach(([key, value]) => {
            //console.log(key +' => '+ value);

            //determine online status
            if(key.startsWith("respondsTo-") && value !== null){
                pcIsOnline = true;
            }

            let $dataContainer = $elem.find('.'+key);
            //badges respondsTo
            if($dataContainer.hasClass("badge")){
                if(value){
                    $dataContainer.removeClass("badge-default");
                    $dataContainer.addClass("badge-success");
                }else{
                    $dataContainer.removeClass("badge-success");
                    $dataContainer.addClass("badge-default");
                }
            }
            //lastResponse
            else if(key === "lastResponse"){
                let $time = $dataContainer.find("time").first();
                $time.attr("datetime", value);
                $time.timeago(); //has to be called after datetime change
                //(first page loading: load database value of previous scan)
                //TODO: fix refresh on gun.js computer.lastResponse update
            }
            //pc description
            else if($dataContainer.length > 0){
                //update html (.hostname/.lanIP/.lanMAC/...)
                $dataContainer.text(value);
            }
            //plugins availables
            else if(key.startsWith("plugin")){
                let pluginName = value;
                if(pluginName !== null){
                    $pluginList.append('<li class="dropdown-item">'+ pluginName +'</li>');
                    if(pluginName===powerOffPlugin){
                        powerOffAvailable = true;
                    }
                }
            }
        });


        //update web ui with online status :
        $elem.find(".card-header").removeClass("onlinePc");
        if(pcIsOnline){
            $elem.find(".card-header").addClass("onlinePc");
        }

        //selected plugin
        let defaultPlugin = wolPlugin;
        if(pcIsOnline && powerOffAvailable){
            defaultPlugin = powerOffPlugin;
        }
        $elem.find('.btn-plugin-value').text(defaultPlugin);

        console.log("[CLIENT.JS] Hiding loader for computer:", id);
        $('#loader').hide();
    }
    //==END=ON=CHANGE=DB=COMPUTERS=====================================================================================


    //==START=ON=CHANGE=DB=MESSAGES=====================================================================================
    gunOnChangeDbMessages(message, id){
        if(message && message.eventSendedAt){
            if(this.pageLoadedAt < message.eventSendedAt && this.lastNotification !== message.eventResult)
            {
                this.lastNotification = message.eventResult; //fix double notification
                //caused by two gun.js 0.8 database update separated by few ms (.eventReceivedAt and then .eventResult)
                //... make .on() function called twice with filled .eventResult

                let response = JSON.parse(this.lastNotification);

                let informations = '';
                informations += 'Event '+ message.eventName +', target :';

                //message contains event data, so :
                if(message.pcTargetLanMAC){
                    informations += '<br>[lanMAC] '+ message.pcTargetLanMAC;
                }
                if(message.pcTargetMachineID){
                    informations += '<br>[MachineID] '+ message.pcTargetMachineID;
                }
                if(response.msg){
                    informations += '<br>'+ response.msg;
                }

                toastr.success(informations);
            }
        }
    }
    //==END=ON=CHANGE=DB=MESSAGES=====================================================================================

}
