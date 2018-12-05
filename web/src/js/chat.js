import JSONFormatter from 'json-formatter-js';

export default class Chat {
	
	/*
	 * [ORIGINALS SOURCES]
	 * Name : Gun Js chat 
	 * Author : Ronald Aug
	 * License : MIT
	 * Link : https://www.github.com/ronaldaug/gunjschat
	 * Require : JQuery/Moment/Gun
	 */

    constructor(functionSendMessage) {
        //CLASS ATTRIBUTS :
        this.functionSendMessage = functionSendMessage;
		this.$container = null;
        this.$chatBox = null;
        this.$form = null;
    }

    //MAIN METHOD :
	init(){
        self = this;
        this.$container = $('div.chat-container');
        this.$chatBox = $('div.chatbox');
        this.$form = $('form#chat');

        //------------------------------------
        // LoginChat
        //------------------------------------//
        let uname = 'notLoaded';
        $.getJSON('/cmd/check', {}, (data) => {
            let userName = 'userFrom';
            if(data.hostname){
                userName += data.hostname;
            }
            localStorage.setItem('userName', userName);
            uname = localStorage.getItem('userName');
            this.scrollToButton();
            this.$container.addClass('show');
        });

        //------------------------------------
        // On submit a message
        //------------------------------------//
        this.$form.on('submit', (event) => {
            event.preventDefault();
            let u_msg = this.$form.find('input.msg').val();
            if (uname && u_msg) {
                let message = {
                    what: u_msg,
                    when: new Date().toISOString(),
                    who: uname,
                    type: 'text'
                };
                this.$form.find('input.msg').val("");
                this.functionSendMessage(message);
            }
        });

        //------------------------------------
        // When hit enter
        //------------------------------------//
        $("input.msg").keypress( (event) => {
            if (event.which !== 13) {
                return;
            }
            event.preventDefault();
            let userMsg = this.$form.find('input.msg').val();
            if (userMsg) {
                this.$form.submit();
            } else {
                alert('Please do not leave input blank');
            }
        });

        //------------------------------------
        // Delete chat messages
        //------------------------------------//
        $('body').on('click', 'i.deletemsg', function() {
            let thisBtn = this;
            let $li = $(thisBtn).closest('li.chatmsg');
            $li.fadeOut('fast');
            sharedObject.dbMessages.get($li.attr('id')).put(null);
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
        element.style['border-radius'] = '5px';
        element.style['padding'] = '10px';
        return element;
    }

    scrollToButton() {
        this.$chatBox.stop().animate({
            scrollTop: this.$chatBox[0].scrollHeight
        });
    }


    //==START=ON=CHANGE=DB=MESSAGES=====================================================================================
    gunOnChangeDbMessages(message, id){
        //(cant use dbMessages.map().once anymore because vue.js consume it when updating his model)
        if (message && message.who)
        {
            let $li = $(
                $('#' + id).get(0) ||
                $('.model').find('li').clone(true).attr({
                    id: id,
                    class: 'collection-item chatmsg',
                    name: message.who,
                }).appendTo('.chatmessage')
            );

            let content = '';
            if(message.type === 'text'){
                content = message.what;
                //detect if content is json :
                let firstChar = content.slice(0,1);
                let lastChar = content.slice(-1);
                if(firstChar==='{' && lastChar==='}'){
                    content = Chat.jsonDisplay(JSON.parse(content));
                }
            }else{
                content = Chat.jsonDisplay(message);
            }

            $li.find('.what').html(content);
            $li.find('.who').text(message.who);
            $li.find('.when').text(moment(message.when).fromNow());
            this.scrollToButton();
        }
    }
    //==END=ON=CHANGE=DB=MESSAGES=====================================================================================


}
