import JSONFormatter from 'json-formatter-js';
function JsonDisplay(jsonOrObject){
    let renderConfig = {
        theme: 'dark',		//dark theme (font colors)
        sortPropertiesBy: function(a,b){ return a>b; }
    };
    let formatter = new JSONFormatter(jsonOrObject, 1, renderConfig);
    let element = formatter.render();
    element.style['backgroundColor'] = '#1E1E1E';	//dark theme (background color)
    element.style['border'] = '1px solid lightgray';
    element.style['border-radius'] = '5px';
    element.style['padding'] = '10px';
    return element;
}


export default function chatJS(sendGunMessage) {
	
	/*
	 * [ORIGINALS SOURCES]
	 * Name : Gun Js chat 
	 * Author : Ronald Aug
	 * License : MIT
	 * Link : https://www.github.com/ronaldaug/gunjschat
	 * Require : JQuery/Moment/Gun
	 */


	let _c = $('div.chat-container');
	let _l = $('div.loginbox');
	let _cb = $('div.chatbox');
	let _fc = $('form#chat');
	let _cm = $('.chatmessage');

	function scrollToButton() {
		_cb.stop().animate({
			scrollTop: _cb[0].scrollHeight
		});
	}
   

	//------------------------------------
	// LoginChat
	//------------------------------------//
    let uname = 'notLoaded';
    $.getJSON('/cmd/check', {}, function(data) {
		let userName = 'userFrom';
		if(data.hostname){
            userName += data.hostname;
		}
        localStorage.setItem('userName', userName);
        scrollToButton();
        uname = localStorage.getItem('userName');
        if (uname && uname !== '') {
            _c.addClass('show');
            _l.addClass('hidden');
        }
	});


	//------------------------------------
	// On submit a message
	//------------------------------------//
	_fc.on('submit', function(event) {
		event.preventDefault();
		let u_msg = _fc.find('input.msg').val();
		if (uname && u_msg) {
			let message = {
                status: "online",
                what: u_msg,
                when: new Date().toISOString(),
            	who: uname,
            	type: 'text'
			};
			_fc.find('input.msg').val("");


            sendGunMessage(message);
		} else {

		}
	});

	//------------------------------------
	// Get messages from gunMessenger db
	//------------------------------------//
	let gunMessenger = sharedObject.dbMessages;
    gunMessenger.map().once(function(message, id) {
		if (message && message.who) {
			let $li = $(
				$('#' + id).get(0) ||
				$('.model').find('li').clone(true).attr({
					id: id,
					class: 'collection-item chatmsg',
					name: message.who,
					status: message.status
				}).appendTo('.chatmessage')
			);

			let content = '';
			if(message.type === 'text'){
				content = message.what;
				//detect if content is json :
				let firstChar = content.slice(0,1);
				let lastChar = content.slice(-1);
				if(firstChar==='{' && lastChar==='}'){
					content = JsonDisplay(JSON.parse(content));
				}
			}else{
				content = JsonDisplay(message);
			}

			$li.find('.what').html(content);
			$li.find('.who').text(message.who);
			$li.find('.when').text(moment(message.when).fromNow());
			$li.find('.status').addClass(message.status);
			scrollToButton();
		}
	});

	//------------------------------------
	// When hit enter 
	//------------------------------------//
	$("input.msg").keypress(function(event) {
        if (event.which !== 13) {
            return;
        }
        event.preventDefault();
        let userMsg = _fc.find('input.msg').val();
        if (userMsg) {
            _fc.submit();
        } else {
            alert('Please do not leave input blank');
        }
    });

	//------------------------------------
	// Delete chat messages
	//------------------------------------//
	$('body').on('click', 'i.deletemsg', function() {
		let $li = $(this).closest('li.chatmsg');
        $li.fadeOut('fast');
        gunMessenger.get($li.attr('id')).put(null);
	});

	//------------------------------------
	// On click logout button
	//------------------------------------//
	$('button.logout').on('click', function() {
		let allIds = [uname];
		_cm.find("li").each(function() {
			if (allIds.indexOf($(this).attr('name')) > -1) {
                gunMessenger.get(this.id).put({
					status: 'offline'
				});
			}
			localStorage.clear();
			$(this).removeClass('show');
			_c.removeClass('show');
			_l.removeClass('hidden');
		});
		location.reload();
	});

	//------------------------------------
	// crawl who is online
	//------------------------------------//
	setInterval(function() {
		function removeDuplicates(arr) {
			let uniqueArr = [];
			for (let i = 0; i < arr.length; i++) {
				if (uniqueArr.indexOf(arr[i]) === -1) {
					uniqueArr.push(arr[i])
				}
			}
			return uniqueArr
		}
		let found = [];
		_cm.find("li[status='online']").each(function() {
			found.push($(this).attr('name'));
		});
		let onlineUsers = removeDuplicates(found);
		let oUsers = '';
		if (onlineUsers.length) {
			oUsers = '<ul class="collection">';
			for (let i = 0; i < onlineUsers.length; i++) {
				oUsers += '<li class="collection-item">' + onlineUsers[i] + '<i class="status online"></i></li>';
			}
			oUsers += '</ul>';
		} else {
			let oUsers = '<ul class="collection"><li class="collection-item">No user is online.</li></ul>';
		}
		$('div.onlinebox').html(oUsers);
	}, 4000)


}
