import JSONFormatter from 'json-formatter-js';
import { $, $$ } from './utils/dom.js';
import { scrollToBottom, fadeOut } from './utils/dom.js';
import { formatRelativeTime } from './utils/date.js';

export default class Chat {
	

    constructor(functionSendMessage) {
        //CLASS ATTRIBUTS :
        this.functionSendMessage = functionSendMessage;
        this.container = null;
        this.chatBox = null;
        this.form = null;
    }

    //MAIN METHOD :
	init(){
        let self = this;
        this.container = document.querySelector('div.chat-container');
        this.chatBox = document.querySelector('div.chatbox');
        this.form = document.querySelector('form#chat');

        //------------------------------------
        // LoginChat
        //------------------------------------//
        let uname = 'notLoaded';
        fetch('/cmd/check')
            .then(response => response.json())
            .then(data => {
                let userName = 'userFrom';
                if(data.hostname){
                    userName += data.hostname;
                }
                localStorage.setItem('userName', userName);
                uname = localStorage.getItem('userName');
                this.scrollToButton();
                if (this.container) {
                    this.container.classList.add('show');
                }
            })
            .catch(error => {
                console.error('[CHAT.JS] Error fetching /cmd/check:', error);
            });

        //------------------------------------
        // On submit a message
        //------------------------------------//
        if (this.form) {
            this.form.addEventListener('submit', (event) => {
                event.preventDefault();
                let msgInput = this.form.querySelector('input.msg');
                let u_msg = msgInput ? msgInput.value : '';
                if (uname && u_msg) {
                    let message = {
                        what: u_msg,
                        when: new Date().toISOString(),
                        who: uname,
                        type: 'text'
                    };
                    if (msgInput) {
                        msgInput.value = "";
                    }
                    this.functionSendMessage(message);
                }
            });
        }

        //------------------------------------
        // When hit enter
        //------------------------------------//
        let msgInput = document.querySelector("input.msg");
        if (msgInput) {
            msgInput.addEventListener('keypress', (event) => {
                if (event.key !== 'Enter') {
                    return;
                }
                event.preventDefault();
                let userMsg = msgInput.value;
                if (userMsg) {
                    if (this.form) {
                        this.form.dispatchEvent(new Event('submit'));
                    }
                } else {
                    alert('Please do not leave input blank');
                }
            });
        }

        //------------------------------------
        // Delete chat messages
        //------------------------------------//
        document.addEventListener('click', function(event) {
            if (event.target.classList.contains('deletemsg') || event.target.closest('i.deletemsg')) {
                let deletemsgBtn = event.target.classList.contains('deletemsg') ? event.target : event.target.closest('i.deletemsg');
                let li = deletemsgBtn.closest('li.chatmsg');
                if (li) {
                    fadeOut(li, 200, () => {
                        let id = li.getAttribute('id');
                        if (id && sharedObject.dbMessages) {
                            sharedObject.dbMessages.get(id).put(null);
                        }
                    });
                }
            }
        });
	}

    //OTHERS METHODS :
    static jsonDisplay(jsonOrObject){
        let renderConfig = {
            theme: 'dark',		//dark theme (font colors)
            sortPropertiesBy: (a,b) => { return a>b; }
        };
        let formatter = new JSONFormatter(jsonOrObject, 1, renderConfig);
        let element = formatter.render();
        element.style['backgroundColor'] = '#1E1E1E';	//dark theme (background color)
        element.style['border'] = '1px solid lightgray';
        element.style['borderRadius'] = '5px';
        element.style['padding'] = '10px';
        return element;
    }

    scrollToButton() {
        if (this.chatBox) {
            scrollToBottom(this.chatBox);
        }
    }


    //==START=ON=CHANGE=DB=MESSAGES=====================================================================================
    dbOnChangeMessages(message, id){
        //(cant use dbMessages.map().once anymore because vue.js consume it when updating his model)
        if (message && message.who)
        {
            let li = document.getElementById(id);
            if (!li) {
                let model = document.querySelector('.model li');
                if (model) {
                    li = model.cloneNode(true);
                    li.id = id;
                    li.className = 'collection-item chatmsg';
                    li.setAttribute('name', message.who);
                    let chatMessage = document.querySelector('.chatmessage');
                    if (chatMessage) {
                        chatMessage.appendChild(li);
                    }
                } else {
                    console.error('[CHAT.JS] Model not found');
                    return;
                }
            }

            let content = '';
            if(message.type === 'text'){
                content = message.what;
                //detect if content is json :
                let firstChar = content.slice(0,1);
                let lastChar = content.slice(-1);
                if(firstChar==='{' && lastChar==='}'){
                    try {
                        content = Chat.jsonDisplay(JSON.parse(content));
                    } catch (e) {
                        console.error("[CHAT.JS] Error parsing JSON content:", e, "Raw content:", content);
                        // En cas d'erreur, on garde le contenu tel quel
                    }
                }
            }else{
                content = Chat.jsonDisplay(message);
            }

            let whatEl = li.querySelector('.what');
            let whoEl = li.querySelector('.who');
            let whenEl = li.querySelector('.when');
            
            if (whatEl) {
                if (typeof content === 'string') {
                    whatEl.innerHTML = content;
                } else {
                    whatEl.innerHTML = '';
                    whatEl.appendChild(content);
                }
            }
            if (whoEl) {
                whoEl.textContent = message.who;
            }
            if (whenEl) {
                whenEl.textContent = formatRelativeTime(message.when);
            }
            this.scrollToButton();
        }
    }
    //==END=ON=CHANGE=DB=MESSAGES=====================================================================================


}
