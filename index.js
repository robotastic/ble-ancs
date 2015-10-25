var Able = require('./lib/able');

var util = require('util');
var debug = require('debug')('BleAncs');
var events = require('events');

var AblePrimaryService = require('./lib/primary-service.js');
var GenericCharacteristic = require('./generic-characteristic');
var Notification = require('./ancs-notification');


var SERVICE_UUID                = '7905f431b5ce4e99a40f4b1e122d00d0';
var NOTIFICATION_SOURCE_UUID    = '9fbf120d630142d98c5825e699a21dbd';
var CONTROL_POINT_UUID          = '69d1d8f345e149a898219bbdfdaad9d9';
var DATA_SOURCE_UUID            = '22eac6e924d64bb5be44b36ace7c7bfb';

function AttributeRequest(uid, attributeId) {
  this.uid = uid;
  this.attributeId = attributeId;
};

function BleAncs() {
	this._able = new Able();

	this._characteristics = {};
	this._notifications = {};
	this._lastUid = null;
  this._requestQueue = [];
  this._requestTimeout = null;
  this._pendingRequest = false;

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
/*      console.log("CHARECTERISTIC: "+characteristics[i]);
      if (characteristics[i].uuid == NOTIFICATION_SOURCE_UUID) {
        console.log("NOTIFICATION_SOURCE_UUID");
      }
     if (characteristics[i].uuid == DATA_SOURCE_UUID) {
        console.log("DATA_SOURCE_UUID");
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
    debug('Notification Removed: ' + notification);
  } else if (notification.event == 'added') {
    debug('Notification Added: ' + notification);
  } else if (notification.event == 'added') {
    debug('Notification Modified: ' + notification);
  }

  if (notification.uid in this._notifications) {

    if (notification.event != 'added') {
      var old_notification = this._notifications[notification.uid];

      notification.versions = old_notification.versions;
      old_notification.versions = undefined;
      notification.versions.push(old_notification);
      this._notifications[notification.uid] = notification;
    }
  } else {
    this._notifications[notification.uid] = notification;
  }


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
  clearTimeout(this._requestTimeout);
  this._pendingRequest = false;
  this.unqueueAttributeRequest();
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

BleAncs.prototype.unqueueAttributeRequest = function() {
  if (this._requestQueue.length) {
    var request = this._requestQueue.shift();
    console.log("Unqueing req, length: " + this._requestQueue.length);

    if (request) {
      this._pendingRequest = true;
      if ((request.attributeId == 0) || (request.attributeId == 4) || (request.attributeId == 5)) {
        this.requestNotificationAttribute(request.uid, request.attributeId);
      } else {
        this.requestNotificationAttribute(request.uid, request.attributeId, 255);
      }
      this._requestTimeout = setTimeout(this.unqueueAttributeRequest.bind(this),1000000);
    }
  }
};

BleAncs.prototype.queueAttributeRequest = function(uid,attributeId) {


 
    console.log("Adding to the queue: " + uid + " attributeId: " + attributeId + " queue: " + this._requestQueue.length);
    var request = new AttributeRequest(uid, attributeId);
    this._requestQueue.push(request);
    this._requestTimeout = setTimeout(this.unqueueAttributeRequest.bind(this),1000000);
  if (this._pendingRequest == false ) {
    this.unqueueAttributeRequest();
  }

};

BleAncs.prototype.onStateChange = function(state) {
  console.log('on -> stateChange: ' + state);

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

   console.log('on -> accept: ' );
	  this._peripheral = peripheral;


  	this.uuid = peripheral.uuid;

  	this._peripheral.on('disconnect', this.onDisconnect.bind(this));
};

BleAncs.prototype.onAdvertisingStart = function(error) {

  console.log('on -> advertisingStart: ' + (error ? 'error ' + error : 'success'));

    this._able.setServices(  [    new AblePrimaryService({
        uuid: '13333333333333333333333333333337',            //'7905f431b5ce4e99a40f4b1e122d00d0',
        characteristics: [new GenericCharacteristic()]
      })
    ]);
};

BleAncs.prototype.onMtuChange = function() {

};


BleAncs.prototype.onEncryptChange = function() {
  console.log("able encryptChange!!!");
      this.discoverServicesAndCharacteristics(function() {
    });
};


BleAncs.prototype.onEncryptFail = function() {
  console.log("able -> encryptFail");
};

BleAncs.prototype.onConnect = function() {
    console.log('able -> connect');
};

BleAncs.prototype.onDisconnect = function() {
  console.log('Got a disconnect');

  this._lastUid = null;
  this._requestQueue = [];
  this._notifications = {};
  if (this._requestTimeout){
    clearTimeout(this._requestTimeout);
    this._requestTimeout = null;
  }

  this._pendingRequest = false;

  this.emit('disconnect');
};




module.exports = BleAncs;
