var BleAncs = require('./index');

var ancs = new BleAncs();


ancs.on('notification', function(notification) {
	notification.readTitle( function(title) {
		notification.readMessage( function(message) {
			console.log("Notification: " + notification);
		});
	});
});