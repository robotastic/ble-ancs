var Inform = require('./index');

var inform = new Inform();

inform.on('notification', function(notification) {

notification.readTitle( function(title) {
	notification.readMessage( function(message) {
		console.log("Notification: " + notification);
	});
});

});