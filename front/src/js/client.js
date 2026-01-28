//=========== polyfill for IE compatibility ============
//String.startsWith()
if (!String.prototype.startsWith) {
    String.prototype.startsWith = function(searchString, position){
        position = position || 0;
        return this.substr(position, searchString.length) === searchString;
    };
}
//=====================================================

import { $, $$, hasClass, addClass, removeClass } from './utils/dom.js';
import { updateTimeElement } from './utils/date.js';
import { toastr } from './utils/notifications.js';

export default class Client {

    constructor(functionSendMessage) {
        //CLASS ATTRIBUTS :
        this.functionSendMessage = functionSendMessage;
        //events notifications (before dbOnChangeMessages first call)
        this.pageLoadedAt = new Date().toISOString();
        this.lastNotification = '';
    }

    //MAIN METHOD :
    init(){
        let self = this;  //that reference to this ca be used inside sub function scope

        //use bootstrap popover on dynamically generated element :
        // Bootstrap 5 popover avec Vanilla JS (pas besoin de jQuery)
        document.addEventListener('mouseenter', function(event) {
            let target = event.target;
            // Vérifier que target est un Element avec classList
            if (target && target.classList && target.classList.contains('cutword')) {
                let thisElement = target;
                if (!hasClass(thisElement, 'popover-initialized')) {
                    const textContent = thisElement.textContent.trim();
                    if (textContent !== '') {
                        addClass(thisElement, 'clickable');
                        
                        // Vérifier si Bootstrap est disponible (window.bootstrap ou bootstrap global)
                        const Bootstrap = window.bootstrap || (typeof bootstrap !== 'undefined' ? bootstrap : null);
                        if (Bootstrap && Bootstrap.Popover) {
                            // Initialiser le popover Bootstrap 5
                            try {
                                new Bootstrap.Popover(thisElement, {
                                    trigger: 'hover focus',
                                    placement: 'top',
                                    content: textContent,
                                    html: false
                                });
                                addClass(thisElement, 'popover-initialized');
                            } catch (error) {
                                console.warn('[CLIENT.JS] Erreur lors de l\'initialisation du popover:', error);
                            }
                        } else {
                            console.warn('[CLIENT.JS] Bootstrap 5 n\'est pas disponible');
                            addClass(thisElement, 'popover-initialized');
                        }
                    }
                }
            }
        }, true); // Use capture phase for event delegation

        //use bootstrap dropdown as select :
        document.addEventListener("click", function(event) {
            let elem = event.target;
            
            // Vérifier que elem est un Element avec classList
            if (!elem || !elem.classList) {
                return;
            }
            
            //close all popovers when clicking outside :
            if (!hasClass(elem, 'popover-initialized') && !hasClass(elem, 'cutword')) {
                let hasAnyPopoverClass = false;
                let attrClass = elem.getAttribute('class');
                if (attrClass) {
                    let tabClass = attrClass.split(' ');
                    for (let i = 0; i < tabClass.length; i++) {
                        if (tabClass[i].indexOf('popover') === 0) {
                            hasAnyPopoverClass = true;
                        }
                    }
                }
                // Fermer tous les popovers si on clique ailleurs
                const Bootstrap = window.bootstrap || (typeof bootstrap !== 'undefined' ? bootstrap : null);
                if (!hasAnyPopoverClass && Bootstrap && Bootstrap.Popover) {
                    try {
                        // Récupérer tous les popovers initialisés et les fermer
                        const popoverElements = document.querySelectorAll('.cutword.popover-initialized');
                        popoverElements.forEach(element => {
                            const popoverInstance = Bootstrap.Popover.getInstance(element);
                            if (popoverInstance) {
                                popoverInstance.hide();
                            }
                        });
                    } catch (error) {
                        console.warn('[CLIENT.JS] Erreur lors de la fermeture des popovers:', error);
                    }
                }
            }
            
            //click on li inside .dropdown-menu :
            if (elem.nodeName.toLowerCase() === 'li') {
                let dropdownMenu = elem.closest(".dropdown-menu");
                if (dropdownMenu) {
                    let selText = elem.textContent;
                    let btnGroup = elem.closest('.btn-group');
                    if (btnGroup) {
                        let btnPluginValue = btnGroup.querySelector('.btn-plugin-value');
                        if (btnPluginValue) {
                            btnPluginValue.innerHTML = selText;
                        }
                    }
                }
            }
        });

        let clearAllMessages = $("#clearAllMessages");
        if (clearAllMessages) {
            clearAllMessages.addEventListener('click', function() {
                //prevent multiple click :
                clearAllMessages.style.display = 'none';
                window.setTimeout(function() {
                    clearAllMessages.style.display = '';
                }, 1000);

                //simulate click on all deletemsg btn :
                let deletemsgBtns = document.querySelectorAll('i.deletemsg');
                deletemsgBtns.forEach(btn => {
                    btn.click();
                });
            });
        }

        document.addEventListener('click', function(event) {
            let target = event.target;
            // Vérifier si le clic est sur un bouton .btn-plugin-submit ou un élément à l'intérieur
            let btn = target.closest('.btn-plugin-submit');
            if (btn) {
                self.sendRequest(btn);
            }
        });
    }

    //OTHERS METHODS :
    sendRequest(btn){
        console.log("[CLIENT.JS] sendRequest called with button:", btn);
        let pc = btn.closest(".pcElem");
        if (!pc) {
            console.warn("[CLIENT.JS] No .pcElem found for button");
            return;
        }
        
        let btnPluginValue = pc.querySelector('.btn-plugin-value');
        let lanMAC = pc.querySelector(".lanMAC");
        let machineID = pc.querySelector(".machineID");
        let isCurrentWebServerElement = pc.querySelector(".isCurrentWebServer");
        let isCurrentWebServer = isCurrentWebServerElement && isCurrentWebServerElement.textContent.trim() === "Yes";
        
        // Confirmation si power-off sur le serveur web actuel
        let eventName = btnPluginValue ? btnPluginValue.textContent : '';
        if (eventName === 'power-off' && isCurrentWebServer) {
            const confirmed = window.confirm(
                "⚠️ WARNING ⚠️\n\n" +
                "You are about to power off the current web server.\n\n" +
                "Are you sure you want to continue?"
            );
            if (!confirmed) {
                return; // canceled by user
            }
        }
        
        let reqData = {
            eventName: eventName,
            eventResult: '',
            eventSendedAt: new Date().toISOString(),
            eventReceivedAt: null,
            pcTargetLanMAC: lanMAC ? lanMAC.textContent : '',
            pcTargetMachineID: machineID ? machineID.textContent : '',
            //-- chat.js --
            type: 'event', //(not text)
            who: localStorage.getItem('userName'), //uname
            when: new Date().toISOString(), //only for display time from now
            //-------------
        };
        //(database cant handle JS multiple dimensions objects, only key:value)
        this.functionSendMessage(reqData);
    }

    //==START=ON=CHANGE=DB=COMPUTERS=====================================================================================
    dbOnChangeComputers(pc, id){
        //.once exec one time | .on exec at every change
        //console.log("[CLIENT.JS] dbComputers has been updated, we have to update the view. function called with - id:", id, "pc:", pc);

        let wolPlugin = 'wol';
        let powerOffPlugin = 'power-off';
        let powerOffAvailable = false;

        //clear data :
        if(id==='' || id===Config.val('TABLE_COMPUTERS')){
            return true; //ignore root element
        }
        
        // Vérifier si l'élément DOM existe déjà
        let elem = document.getElementById(id);
        const elementExists = !!elem;
        

        //retrieve element or clone the model if not found
        if(!elem){
            let pcModel = document.querySelector('#pcModel .pcElem');
            if (pcModel) {
                elem = pcModel.cloneNode(true);
                elem.id = id;
                let pcList = document.querySelector('#pcList');
                if (pcList) {
                    pcList.appendChild(elem);
                } else {
                    console.error("[CLIENT.JS] pcList not found");
                    return;
                }
            } else {
                console.error("[CLIENT.JS] pcModel not found");
                return;
            }
        }

        //hide some badges if app is not installed :
        let badges = elem.querySelectorAll(".badge.requireApp");
        if(pc.machineID){
            badges.forEach(badge => {
                badge.style.display = '';
            });
        }else{
            badges.forEach(badge => {
                badge.style.display = 'none';
            });
        }

        let pluginList = elem.querySelector('.btn-plugin-choice .dropdown-menu');
        if (pluginList) {
            pluginList.innerHTML = ''; //empty plugin list of this pc
        }

        let pcIsOnline = false;

        // Check if isCurrentWebServer localy on front (should not be synchronized in the database !)
        // (compare the iterated pc.idPC with the web server idPC) 
        const serverIdPC = sharedObject && sharedObject.webRtcClient ? sharedObject.webRtcClient.getServerIdPC() : null;
        const isCurrentWebServer = id && serverIdPC && id === serverIdPC;
        
        // Debug logs
        if (!serverIdPC) {
            console.warn("[CLIENT.JS] ERROR - serverIdPC is null/undefined. sharedObject:", sharedObject);
        }
        
        // on actualise des le debut le fait que le serveur qui renvoie la page web est en ligne
        if(isCurrentWebServer){
            //console.log("[CLIENT.JS] DEBUG - isCurrentWebServer is TRUE for id:", id);
            pcIsOnline = true;
            pc['respondsTo-arp'] = true;
            // on ne force pas respondsTo-ping car pas forcement actif sur le serveur web (firewall, etc.)
        }
        
        Object.entries(pc).forEach(([key, value]) => {
            //console.log(key +' => '+ value);
            
            //cast "boolean" value from database
            const valueIsTrue = value === true || value === "true" || value === 1 || value === "1";

            //determine online status
            // Un PC est en ligne s'il répond à au moins un check (ping, http ou socket)
            if(key.startsWith("respondsTo-") && valueIsTrue){
                pcIsOnline = true;
            }

            //plugins availables - traiter AVANT le return pour les clés sans conteneur DOM
            if(key.startsWith("plugin")){
                let pluginName = value;
                if(pluginName !== null && pluginList){
                    let li = document.createElement('li');
                    li.className = 'dropdown-item';
                    li.textContent = pluginName;
                    pluginList.appendChild(li);
                    if(pluginName===powerOffPlugin){
                        powerOffAvailable = true;
                    }
                }
                return;
            }

            let dataContainer = elem.querySelector('.'+key);
            if (!dataContainer) return;
            
            //badges respondsTo
            if(hasClass(dataContainer, "badge")){
                // Vérifier si la valeur est true (booléen ou chaîne "true")
                if(valueIsTrue){
                    removeClass(dataContainer, "bg-secondary");
                    addClass(dataContainer, "bg-success");
                }else{
                    removeClass(dataContainer, "bg-success");
                    addClass(dataContainer, "bg-secondary");
                }
            }
            //Last response
            else if(key === "lastResponse"){
                let time = dataContainer.querySelector("time");
                if (time) {
                    updateTimeElement(time, value);
                }
            }
            //pc description
            else {
                //update html (.hostname/.lanIP/.lanMAC/...)
                dataContainer.textContent = value;
            }
        });

        // Update the view with isCurrentWebServer value : 
        let isCurrentWebServerField = elem.querySelector('.isCurrentWebServer');
        if (isCurrentWebServerField) {
            isCurrentWebServerField.textContent = isCurrentWebServer ? "Yes" : "No";
            // Show isCurrentWebServer row if it's the server :
            if (isCurrentWebServer) {
                removeClass(isCurrentWebServerField.closest('.row'), 'hidden');
            }
        }

        //update web ui with online status :
        let cardHeader = elem.querySelector(".card-header");
        if (cardHeader) {
            removeClass(cardHeader, "onlinePc");
            if(pcIsOnline){
                addClass(cardHeader, "onlinePc");
            }
        }

        // count the number of availables options in dropdown 
        let dropdownItems = pluginList ? pluginList.querySelectorAll('.dropdown-item') : [];
        let availableOptions = Array.from(dropdownItems).filter(item => item.textContent && item.textContent.trim() !== '');
        //console.log("[DEBUG CLIENT.JS] pc " + pc.idPC + " availableOptions.length:", availableOptions.length);

        //selected plugin
        let defaultPlugin = wolPlugin;
        if(pcIsOnline && powerOffAvailable){
            defaultPlugin = powerOffPlugin;
        }
        let btnPluginValue = elem.querySelector('.btn-plugin-value');
        if (btnPluginValue) {
            btnPluginValue.textContent = defaultPlugin;
        }
        
        // if only one option, disable opening of empty dropdown
        let dropdownToggle = elem.querySelector('.btn-plugin-link');
        if (dropdownToggle) {
            if (availableOptions.length === 1 || availableOptions.length === 0) {
                // Add disabled to prevent oppening of empty dropdown
                dropdownToggle.setAttribute('disabled', 'disabled');
            } else {
                // Remove disabled if more than 1 option available
                dropdownToggle.removeAttribute('disabled');
            }
        }

        //console.log("[CLIENT.JS] Hiding loader for computer:", id);
        let loader = $("#loader");
        if (loader) {
            loader.style.display = 'none';
        }
    }
    //==END=ON=CHANGE=DB=COMPUTERS=====================================================================================


    //==START=ON=CHANGE=DB=MESSAGES=====================================================================================
    dbOnChangeMessages(message, id){
        if(message && message.eventSendedAt){
            if(this.pageLoadedAt < message.eventSendedAt && this.lastNotification !== message.eventResult)
            {
                if(!message.eventName){
                    return; // dont show notification for simple chat messages
                }

                this.lastNotification = message.eventResult; //fix double notification
                //caused by two database updates separated by few ms (.eventReceivedAt and then .eventResult)
                //... make .on() function called twice with filled .eventResult

                let response = null;
                // Vérifier que eventResult n'est pas vide, null ou undefined avant de parser
                if(this.lastNotification && typeof this.lastNotification === 'string' && this.lastNotification.trim() !== ''){
                    try {
                        response = JSON.parse(this.lastNotification);
                    } catch (e) {
                        console.error("[CLIENT.JS] Error parsing eventResult JSON:", e, "Raw value:", this.lastNotification);
                        // Si le parsing échoue, on continue avec response = null
                        response = null;
                    }
                }

                let informations = '';
                informations += 'Event '+ message.eventName +', target :';

                //message contains event data, so :
                if(message.pcTargetLanMAC){
                    informations += '<br>[lanMAC] '+ message.pcTargetLanMAC;
                }
                if(message.pcTargetMachineID){
                    informations += '<br>[MachineID] '+ message.pcTargetMachineID;
                }
                if(response && response.msg){
                    informations += '<br>'+ response.msg;
                }

                toastr.success(informations);
            }
        }
    }
    //==END=ON=CHANGE=DB=MESSAGES=====================================================================================

}
