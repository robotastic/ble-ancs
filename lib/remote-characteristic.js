var debug = require('debug')('characteristic');

var events = require('events');
var util = require('util');

var characteristics = require('./characteristics.json');

function RemoteCharacteristic(able, peripheralId, serviceUuid, uuid, properties) {
  this._able = able;
  this._peripheralId = peripheralId;
  this._serviceUuid = serviceUuid;

  this.uuid = uuid;
  this.name = null;
  this.type = null;
  this.properties = properties;
  this.descriptors = null;

  var characteristic = characteristics[uuid];
  if (characteristic) {
    this.name = characteristic.name;
    this.type = characteristic.type;
  }
}

util.inherits(RemoteCharacteristic, events.EventEmitter);

RemoteCharacteristic.prototype.toString = function() {
  return JSON.stringify({
    uuid: this.uuid,
    name: this.name,
    type: this.type,
    properties: this.properties
  });
};

RemoteCharacteristic.prototype.read = function(callback) {
  if (callback) {
    this.once('read', function(data) {
      callback(null, data);
    });
  }

  this._able.read(
    this._peripheralId,
    this._serviceUuid,
    this.uuid
  );
};

RemoteCharacteristic.prototype.write = function(data, withoutResponse, callback) {
  if (process.title !== 'browser') {
    if (!(data instanceof Buffer)) {
      throw new Error('data must be a Buffer');
    }
  }

  if (callback) {
    this.once('write', function() {
      callback(null);
    });
  }

  this._able.write(
    this._peripheralId,
    this._serviceUuid,
    this.uuid,
    data,
    withoutResponse
  );
};

RemoteCharacteristic.prototype.broadcast = function(broadcast, callback) {
  if (callback) {
    this.once('broadcast', function() {
      callback(null);
    });
  }

  this._able.broadcast(
    this._peripheralId,
    this._serviceUuid,
    this.uuid,
    broadcast
  );
};

RemoteCharacteristic.prototype.notify = function(notify, callback) {
  if (callback) {
    this.once('notify', function() {
      callback(null);
    });
  }

  this._able.notify(
    this._peripheralId,
    this._serviceUuid,
    this.uuid,
    notify
  );
};

RemoteCharacteristic.prototype.discoverDescriptors = function(callback) {
  if (callback) {
    this.once('descriptorsDiscover', function(descriptors) {
      callback(null, descriptors);
    });
  }

  this._able.discoverDescriptors(
    this._peripheralId,
    this._serviceUuid,
    this.uuid
  );
};

module.exports = RemoteCharacteristic;
