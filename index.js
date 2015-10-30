var Able = require('./lib/able');

var util = require('util');
var debug = require('debug');
var debugStatus = debug('ble-ancs:status');
var debugNotifications = debug('ble-ancs:notifications');
var events = require('events');

var AblePrimaryService = require('./lib/primary-service.js');
var GenericCharacteristic = require('./generic-characteristic');
var Notification = require('./ancs-notification');


var SERVICE_UUID                = '7905f431b5ce4e99a40f4b1e122d00d0';
var NOTIFICATION_SOURCE_UUID    = '9fbf120d630142d98c5825e699a21dbd';
var CONTROL_POINT_UUID          = '69d1d8f345e149a898219bbdfdaad9d9';
var DATA_SOURCE_UUID            = '22eac6e924d64bb5be44b36ace7c7bfb';


function BleAncs() {
	this._able = new Able();

	this._characteristics = {};
	this._notifications = {};
	this._lastUid = null;

	this._able.on('stateChange', this.onStateChange.bind(this));
	this._able.on('accept', this.onAccept.bind(this));
	this._able.on('mtuChange', this.onMtuChange.bind(this));
	this._able.on('advertisingStart', this.onAdvertisingStart.bind(this));
	this._able.on('encryptChange', this.onEncryptChange.bind(this));
	this._able.on('encryptFail', this.onEncryptFail.bind(this));
	this._able.on('connect', this.onConnect.bind(this));
	this._able.on('disconnect', this.onDisconnect.bind(this));
};

util.inherits(BleAncs, events.EventEmitter);

BleAncs.prototype.discoverServicesAndCharacteristics = function(callback) {
  this._peripheral.findServiceAndCharacteristics(SERVICE_UUID, [], function(error, services, characteristics) {
    for (var i in characteristics) {
/*      debugStatus("CHARECTERISTIC: "+characteristics[i]);
      if (characteristics[i].uuid == NOTIFICATION_SOURCE_UUID) {
        debugStatus("NOTIFICATION_SOURCE_UUID");
      }
     if (characteristics[i].uuid == DATA_SOURCE_UUID) {
        debugStatus("DATA_SOURCE_UUID");
      }*/
      this._characteristics[characteristics[i].uuid] = characteristics[i];
    }

    this._characteristics[NOTIFICATION_SOURCE_UUID].on('read', this.onNotification.bind(this));
    this._characteristics[DATA_SOURCE_UUID].on('read', this.onData.bind(this));

    this._characteristics[NOTIFICATION_SOURCE_UUID].notify(true);
    this._characteristics[DATA_SOURCE_UUID].notify(true);

    callback();
  }.bind(this));
};

BleAncs.prototype.onNotification = function(data) {
  var notification = new Notification(this, data);

  if (notification.event == 'removed') {
    debugNotifications('Notification Removed: ' + notification);
  } else if (notification.event == 'added') {
    debugNotifications('Notification Added: ' + notification);
  } else if (notification.event == 'added') {
    debugNotifications('Notification Modified: ' + notification);
  }

  if (notification.uid in this._notifications) {
    var old_notification = this._notifications[notification.uid];

    notification.versions = old_notification.versions;
    old_notification.versions = undefined;
    notification.versions.push(old_notification);
  }

  this._notifications[notification.uid] = notification;
  this.emit('notification', notification);

};

BleAncs.prototype.onData = function(data) {
  var commandId = data.readUInt8(0);

  if (commandId === 0x00) {
    var uid = data.readUInt32LE(1);
    var notificationData = data.slice(5);

    this._lastUid = uid;

    this._notifications[uid].emit('data', notificationData);
  } else {
    if (this._lastUid) {
      this._notifications[this._lastUid].emit('data',data);
    }
  }
};

BleAncs.prototype.requestNotificationAttribute = function(uid, attributeId, maxLength) {
  var buffer = new Buffer(maxLength ? 8 : 6);

  buffer.writeUInt8(0x00, 0);
  buffer.writeUInt32LE(uid, 1);
  buffer.writeUInt8(attributeId, 5);
  if (maxLength) {
    buffer.writeUInt16LE(maxLength, 6);
  }

  this._characteristics[CONTROL_POINT_UUID].write(buffer, false);
};



BleAncs.prototype.onStateChange = function(state) {
  debugStatus('on -> stateChange: ' + state);

  if (state === 'poweredOn') {
    if (this._able.startAdvertisingWithEIRData) {
      /*var ad = new Buffer([
        // flags
        0x02, 0x01, 0x02,

        // ANCS solicitation
        0x11, 0x15, 0xd0, 0x00, 0x2D, 0x12, 0x1E, 0x4B, 0x0F,
        0xA4, 0x99, 0x4E, 0xCE, 0xB5, 0x31, 0xF4, 0x05, 0x79
      ]);*/

     var ad = new Buffer([
        // flags
        0x02, 0x01, 0x05,

        //device name
        0x0a, 0x09, 0x41, 0x4e, 0x42, 0x52, 0x21, 0x54, 0x75, 0x73, 0x6b,

        // Appearence
        0x03, 0x19, 0x40, 0x02

        ]);

      //var scan = new Buffer([0x05, 0x08, 0x74, 0x65, 0x73, 0x74]); // name
      var scan = new Buffer([0x11, 0x15, 0xd0, 0x00, 0x2D, 0x12, 0x1E, 0x4B, 0x0F,
        0xA4, 0x99, 0x4E, 0xCE, 0xB5, 0x31, 0xF4, 0x05, 0x79]);
      this._able.startAdvertisingWithEIRData(ad, scan);
    } else {
      this._able.startAdvertising('ancs-test', ['7905f431b5ce4e99a40f4b1e122d00d0']);
    }

  } else {
    this._able.stopAdvertising();
  }
};



BleAncs.prototype.onAccept = function(peripheral) {

   debugStatus('on -> accept: ' );
	  this._peripheral = peripheral;


  	this.uuid = peripheral.uuid;

  	this._peripheral.on('disconnect', this.onDisconnect.bind(this));
};

BleAncs.prototype.onAdvertisingStart = function(error) {

  debugStatus('on -> advertisingStart: ' + (error ? 'error ' + error : 'success'));

    this._able.setServices(  [    new AblePrimaryService({
        uuid: '13333333333333333333333333333337',            //'7905f431b5ce4e99a40f4b1e122d00d0',
        characteristics: [new GenericCharacteristic()]
      })
    ]);
};

BleAncs.prototype.onMtuChange = function() {

};


BleAncs.prototype.onEncryptChange = function() {
  debugStatus("able encryptChange!!!");
      this.discoverServicesAndCharacteristics(function() {
    });
};


BleAncs.prototype.onEncryptFail = function() {
  debugStatus("able -> encryptFail");
};

BleAncs.prototype.onConnect = function() {
    debugStatus('able -> connect');
};

BleAncs.prototype.onDisconnect = function() {
  debugStatus('Got a disconnect');



  this.emit('disconnect');
};




module.exports = BleAncs;
