function chatJS(){
	
	/*
	 * Name : Gun Js chat 
	 * Author : Ronald Aug
	 * License : MIT
	 * Link : https://www.github.com/ronaldaug/gunjschat
	 * Require : JQuery/Moment/Gun
	 */

	//------------------------------------
	// Gun db via heroku
	//------------------------------------//
	//var gun = Gun('https://gunjs.herokuapp.com/gun').get('XeDedsEdfdEdfd');  //OK

    //------------------------------------
    // Gun db via node js
    //------------------------------------//
    // var gun = sharedObject.gun.get('XeDedsEdfdEdfd');
    // => use function sendGunMessage()


	var _c = $('div.chat-container');
	var _in = $('input.name');
	var _l = $('div.loginbox');
	var _cb = $('div.chatbox');
	var _fc = $('form#chat');
	var _cm = $('.chatmessage');

	function scrollToButton() {
		_cb.stop().animate({
			scrollTop: _cb[0].scrollHeight
		});
	}
   

	//------------------------------------
	// LoginChat
	//------------------------------------//
    var uname = 'notLoaded';
    $.getJSON('/cmd/check', {}, function(data) {
		var userName = 'userFrom';
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
		var u_msg = _fc.find('input.msg').val();
		if (uname && u_msg) {
			var message = {};
			message.status = "online";
			message.what = u_msg;
            message.when = new Date().toISOString(),
			message.who = uname;
			_fc.find('input.msg').val("");

            message.type = 'text';
            sendGunMessage(message);
		} else {
			return;
		}
	});

	//------------------------------------
	// Get messages from gunMessenger db
	//------------------------------------//
	var gunMessenger = sharedObject.dbMessages;
    gunMessenger.map().val(function(message, id) {
		if (message) {
			if (!message.who && message.who !== '') {
				return;
			} else {
				var $li = $(
					$('#' + id).get(0) ||
					$('.model').find('li').clone(true).attr({
						id: id,
						class: 'collection-item chatmsg',
						name: message.who,
						status: message.status
					}).appendTo('.chatmessage')
				);


				var content = '';
				if(message.type === 'text'){
                    content = message.what;
                    var firstChar = content.slice(0,1);
                    var lastChar = content.slice(-1);
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
		} else {
			return;
		}
	});

	//------------------------------------
	// When hit enter 
	//------------------------------------//
	$("input.msg").keypress(function(event) {
		if (event.which == 13) {
			event.preventDefault();
			var userMsg = _fc.find('input.msg').val();
			if (userMsg) {
				_fc.submit();
			} else {
				alert('Please do not leave input blank');
			}
		}
	});

	//------------------------------------
	// Delete chat messages by double clicks
	//------------------------------------//
	$('body').on('click', 'i.deletemsg', function(event) {
		var $li = $(this).closest('li.chatmsg');
        $li.fadeOut('fast');
        gunMessenger.get($li.attr('id')).put(null);
	});

	//------------------------------------
	// On click logout button
	//------------------------------------//
	$('button.logout').on('click', function() {
		var allIds = [uname];
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
		})
		location.reload();
	})

	//------------------------------------
	// crawl who is online
	//------------------------------------//
	setInterval(function() {
		function removeDuplicates(arr) {
			var uniqueArr = []
			for (var i = 0; i < arr.length; i++) {
				if (uniqueArr.indexOf(arr[i]) == -1) {
					uniqueArr.push(arr[i])
				}
			}
			return uniqueArr
		}
		var found = [];
		_cm.find("li[status='online']").each(function() {
			found.push($(this).attr('name'));
		})
		var onlineUsers = removeDuplicates(found);
		if (onlineUsers.length) {
			var oUsers = '<ul class="collection">';
			for (i = 0; i < onlineUsers.length; i++) {
				oUsers += '<li class="collection-item">' + onlineUsers[i] + '<i class="status online"></i></li>';
			}
			oUsers += '</ul>';
		} else {
			var oUsers = '<ul class="collection"><li class="collection-item">No user is online.</li></ul>';
		}
		$('div.onlinebox').html(oUsers);
	}, 4000)


}
