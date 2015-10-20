var BleAncs = require('./index');

var ancs = new BleAncs();

ancs.on('notification', function(notification) {
	console.log("Got Notification: "+ notification);
	notification.readAttributes(function(attributes) {
		console.log("Notification: " + attributes);

	});

});