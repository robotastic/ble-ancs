var BleAncs = require('./index');
var Gpio = require('onoff').Gpio,
  led = new Gpio(7, 'out');


var ancs = new BleAncs();

ancs.on('notification', function(notification) {

//will blink an led on GPIO pin 7 everytime there is a new notification

	notification.readTitle( function(title) {
		notification.readMessage( function(message) {
			console.log("Notification: " + notification);
			
		});
	});
	led.write(1, function() {          // Set pin 16 high (1) 
   		setTimeout(function() {
   			led.writeSync(1);                   // Close pin 16 
    	},1000);
	});

});