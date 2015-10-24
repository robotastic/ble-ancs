var BleAncs = require('../index');

var ancs = new BleAncs();


var express = require('express');
var app = express();
app.set('view engine', 'jade');

app.get('/', function (req, res) {
  res.render('index', { notifications: ancs._notifications});
});

var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Example app listening at http://%s:%s', host, port);
});


ancs.on('notification', function(notification) {
	notification.readTitle( function(title) {
		notification.readSubtitle( function(title) {
			notification.readDate( function(title) {
				notification.readMessage( function(message) {
					console.log("Notification: " + notification);
				});
			});
		});
	});
});