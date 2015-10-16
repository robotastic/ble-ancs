var BleAncs = require('./index');
var gpio = require("pi-gpio");

var ancs = new BleAncs();

ancs.on('notification', function(notification) {

//will blink an led on GPIO pin 7 everytime there is a new notification

	notification.readTitle( function(title) {
		notification.readMessage( function(message) {
			console.log("Notification: " + notification);
			
		});
	});
	gpio.open(7, "output", function(err) {     // Open pin 16 for output 
   		gpio.write(7, 1, function() {          // Set pin 16 high (1) 
   			setTimeout(function() {
   				gpio.write(7, 1, function() { 
        			gpio.close(7);  
        		});                   // Close pin 16 
    		},1000);
		});
	});

});