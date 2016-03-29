var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var routes = require('./routes/index');
var base64 = require('node-base64-image');
var fs = require('fs');
var mkdirp = require('mkdirp');
var easyimg = require('easyimage');

var app = express();
var http = require('http').Server(app);
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set( "ipaddr", "127.0.0.1" );
app.set( "port", 3000 );

app.use('/', routes);

var httpServer = http.listen(app.get('port'), function(){
	console.log("Express server listening on port " + app.get('port'));
});

var io = require('socket.io').listen(httpServer);

var session = require('express-session')({
	secret: 'sadfwer',
	resave: true,
	saveUninitialized: true
}),
sharedsession = require("express-socket.io-session");

app.use(session);

var count = 0;
var rooms = [];
 
/*app.get('/:room',function(req,res){
    console.log('room name is :'+req.params.room);
    res.render('index',{room:req.params.room});
});*/

io.use(sharedsession(session));

/*** Socket.IO 추가 ***/
io.on('connection',function(socket){

	socket.emit("chat_init", {id:socket.id});

	socket.on('load_room', function(data){
		var roomlist = new Array();
		for(var room in rooms){
			roomlist.push(rooms[room]);
		}
		io.sockets.emit('list_room',{rooms:roomlist});
	});

	/** 닉네임 설정 **/
	socket.on('nickname_init', function(data){
		socket.username = data.nickname; //소켓 네임 설정
	});

	/** 접속해제할 경우 **/
	socket.on('disconnect', function(){
		var url = socket.room;
		if (url != undefined){
			delete rooms[url].socket_ids[socket.id];
			socket.broadcast.to(socket.room).emit('broadcast_msg', {msg:socket.username+"님이 대화방에서 나갔습니다.",type:"notify"});

			var userList = new Array();
			for (var key in rooms[url].socket_ids) {
				if (rooms[url].socket_ids.hasOwnProperty(key)) {
					userList.push(rooms[url].socket_ids[key]);
				}
			}
			socket.broadcast.to(socket.room).emit('userlist', {users:userList});
			if(Object.keys(rooms[url].socket_ids).length == 0){
				socket.leave(socket.room);
				delete rooms[url];
				var roomlist = new Array();
				for(var room in rooms){
					roomlist.push(rooms[room]);
				}
				io.sockets.emit('list_room',{rooms:roomlist});
			}
		}
		//console.log('user disconnected');
	});

	/** 채팅방 만들기 **/
	socket.on('create_room', function(data){

		var url = data.url;
		if (rooms[url] == undefined) {
			rooms[url] = new Object();
			rooms[url].title = data.title;
			rooms[url].url = url;
			rooms[url].socket_ids = new Object();
		}
		
		var roomlist = new Array();
		for(var room in rooms){
			roomlist.push(rooms[room]);
		}
		io.sockets.emit('list_room',{rooms:roomlist});
	});

	/** 채팅방 접속 **/
	socket.on('join_room', function(data){
		//다른 채팅방에서 옮겨왔을경우 처리
		if(socket.room != undefined){
			delete rooms[socket.room].socket_ids[socket.id];
			socket.broadcast.to(socket.room).emit('broadcast_msg', {msg:socket.username+"님이 대화방에서 나갔습니다.",type:"notify"});

			var userList = new Array();
			for (var key in rooms[data.url].socket_ids) {
				if (rooms[data.url].socket_ids.hasOwnProperty(key)) {
					userList.push(rooms[data.url].socket_ids[key]);
				}
			}
			socket.broadcast.to(socket.room).emit('userlist', {users:userList});
			if(Object.keys(rooms[socket.room].socket_ids).length == 0){
				socket.leave(socket.room);
				delete rooms[socket.room];
				var roomlist = new Array();
				for(var room in rooms){
					roomlist.push(rooms[room]);
				}
				io.sockets.emit('list_room',{rooms:roomlist});
			}
		}

		if (rooms[data.url] != undefined) {
			var url = data.url;
			var nickname = socket.username;

			socket.room = url; //소켓 방 설정
			socket.join(url); //소켓방에 접속

			rooms[url].socket_ids[socket.id] = nickname;
			io.sockets.in(url).emit('broadcast_msg', {msg:nickname+"님이 대화방에 입장하였습니다",type:"notify"});

			var userList = new Array();
			for (var key in rooms[url].socket_ids) {
				if (rooms[url].socket_ids.hasOwnProperty(key)) {
					userList.push(rooms[url].socket_ids[key]);
				}
			}

			io.sockets.in(url).emit('userlist', {users:userList});
		}
	});

	/** 채팅방 나가기 **/
	socket.on('leave_room', function(data){
		delete rooms[socket.room].socket_ids[socket.id];
		socket.broadcast.to(socket.room).emit('broadcast_msg', {msg:socket.username+"님이 대화방에서 나갔습니다.",type:"notify"});

		var userList = new Array();
		for (var key in rooms[socket.room].socket_ids) {
			if (rooms[socket.room].socket_ids.hasOwnProperty(key)) {
				userList.push(rooms[socket.room].socket_ids[key]);
			}
		}
		socket.broadcast.to(socket.room).emit('userlist', {users:userList});
		if(Object.keys(rooms[socket.room].socket_ids).length == 0){
			socket.leave(socket.room);
			delete rooms[socket.room];
			var roomlist = new Array();
			for(var room in rooms){
				roomlist.push(rooms[room]);
			}
			io.sockets.emit('list_room',{rooms:roomlist});
		}
		socket.room = null;
	});
 
	/** 메시지 전송 처리 **/
	socket.on('send_msg',function(data){
		var date = new Date();
		var time;
		if (date.getHours() <= 12) {
			time = "오전 "+date.getHours()+":"+parseMinute(date.getMinutes());
		}else {
			time = "오후 "+(date.getHours()-12)+":"+parseMinute(date.getMinutes());
		}
		io.sockets.in(socket.room).emit('broadcast_msg', {msg:data.msg,username:socket.username,type:"message",id:socket.id,time:time});
	});

	/** 이미지 업로드 처리 **/
	socket.on('image_upload',function(data){
		var date = new Date();
		var time;
		if (date.getHours() <= 12) {
			time = "오전 "+date.getHours()+":"+parseMinute(date.getMinutes());
		}else {
			time = "오후 "+(date.getHours()-12)+":"+parseMinute(date.getMinutes());
		}

		//이미지 업로드 처리
		var path = "upload/original/"+date.getFullYear()+"/"+(date.getMonth()+1)+"/";
		var thumbPath = "upload/thumb/"+date.getFullYear()+"/"+(date.getMonth()+1)+"/";
		var fileName = Math.floor(Date.now() / 1000)+randomString();

		var options = {filename: "public/"+path+fileName};
		var imageData = new Buffer(data.baseurl, 'base64');

		try{
			fs.statSync("public/"+path).isDirectory();
			base64.base64decoder(imageData, options, function (err, saved) {
				if (err) { console.log(err); throw err; }
				//썸네일 생성
				easyimg.thumbnail({
					src: "public/"+path+fileName,
					dst: "public/"+thumbPath+fileName,
					width: 1200,
					quality: 90
				}).then(
					function(image){
						console.log('Resized and cropped: ' + image.width + ' x ' + image.height);
					},
					function(err){
						console.log(err);
					}
				);
			});
		}catch(e){
			mkdirp("public/"+path, function(err) {
				if(err) throw err;
				mkdirp("public/"+thumbPath, function(err) {
					if(err) throw err;
					base64.base64decoder(imageData, options, function (err, saved) {
						if (err) { console.log(err); throw err; }
						//썸네일 생성
						easyimg.thumbnail({
							src: "public/"+path+fileName,
							dst: "public/"+thumbPath+fileName,
							width: 1200,
							quality: 90
						}).then(
							function(image){
								console.log('Resized and cropped: ' + image.width + ' x ' + image.height);
							},
							function(err){
								console.log(err);
							}
						);
					});
				});
			});
		}
		console.log(fileName);

		io.sockets.in(socket.room).emit('broadcast_msg', {msg:path+fileName+".jpg",username:socket.username,type:"image",id:socket.id,time:time});
	});
});

function parseMinute(minute){
	if(minute.length < 10) {
		return "0" + minute;
	}else{
		return minute;
	}
}

function randomString(){
	var text = "";
	var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for( var i=0; i < 4; i++ ) text += possible.charAt(Math.floor(Math.random() * possible.length));

	return text;
}


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});


module.exports = app;
