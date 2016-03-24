var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var routes = require('./routes/index');
var users = require('./routes/users');

var app = express();
var http = require('http').Server(app);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set( "ipaddr", "127.0.0.1" );
app.set( "port", 3000 );

app.use('/', routes);
app.use('/users', users);

var httpServer = http.listen(app.get('port'), function(){
    console.log("Express server listening on port " + app.get('port'));
});

var io = require('socket.io').listen(httpServer);

var count = 0;
var rooms = [];
 
app.get('/:room',function(req,res){
    console.log('room name is :'+req.params.room);
    res.render('index',{room:req.params.room});
});

/*** Socket.IO 추가 ***/
io.sockets.on('connection',function(socket){
	
	socket.on('load_room', function(data){
		var roomlist = new Array();
		for(var room in rooms){
			roomlist.push(rooms[room]);
		}
		socket.emit('list_room',{rooms:roomlist});
	});

	/** 닉네임 설정 **/
	socket.on('nickname_init', function(data){
		socket.username = data.nickname; //소켓 네임 설정
	});

	/** 접속해제할 경우 **/
	socket.on('disconnect', function(){
		//console.log(socket.room);
		var url = socket.room;
		if (url != undefined){
			delete rooms[url].socket_ids[socket.username];
			io.sockets.in(socket.room).emit('broadcast_msg', {msg:socket.username+"님이 대화방에서 나갔습니다."});
			io.sockets.in(socket.room).emit('userlist', {users:Object.keys(rooms[url].socket_ids)});
		}
		//console.log('user disconnected');
	});

	/** 채팅방 만들기 **/
	socket.on('create_room', function(data){
		var url = data.url;
		var nickname =  socket.username;

		socket.room = url; //소켓 방 설정
		socket.join(url); //소켓방에 접속

		/** 채팅방 생성 **/
		if (rooms[url] == undefined) {
			rooms[url] = new Object();
			rooms[url].title = data.title;
			rooms[url].url = url;
			rooms[url].socket_ids = new Object();
		}

		rooms[url].socket_ids[nickname] = socket.id;
		
		var roomlist = new Array();
		for(var room in rooms){
			roomlist.push(rooms[room]);
		}
		socket.broadcast.emit('list_room',{rooms:roomlist});

		io.sockets.in(socket.room).emit('broadcast_msg', {msg:nickname+"님이 대화방에 입장하였습니다"});
		io.sockets.in(socket.room).emit('userlist', {users:Object.keys(rooms[url].socket_ids)});
	});

	/** 채팅방 접속 **/
	socket.on('join_room', function(data){
		var url = data.url;
		var nickname = data.nickname;

		socket.username = nickname; //소켓 네임 설정
		socket.room = url; //소켓 방 설정
		socket.join(url); //소켓방에 접속

		rooms[url].socket_ids[nickname] = socket.id;
		io.sockets.in(socket.room).emit('broadcast_msg', {msg:nickname+"님이 대화방에 입장하였습니다"});
		io.sockets.in(socket.room).emit('userlist', {users:Object.keys(rooms[url].socket_ids)});
	});
 
	/** 메시지 전송 처리 **/
	socket.on('send_msg',function(data){
		data.msg = socket.username + ' : ' + data.msg;
		io.sockets.in(socket.room).emit('broadcast_msg', {msg:data.msg,username:socket.username});
	});
}); 

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
