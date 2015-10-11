var debug = require('debug')('descriptor');

var events = require('events');
var util = require('util');

var descriptors = require('./descriptors.json');

function RemoteDescriptor(able, peripheralId, serviceUuid, characteristicUuid, uuid) {
  this._able = able;
  this._peripheralId = peripheralId;
  this._serviceUuid = serviceUuid;
  this._characteristicUuid = characteristicUuid;

  this.uuid = uuid;
  this.name = null;
  this.type = null;

  var descriptor = descriptors[uuid];
  if (descriptor) {
    this.name = descriptor.name;
    this.type = descriptor.type;
  }
}

util.inherits(RemoteDescriptor, events.EventEmitter);

RemoteDescriptor.prototype.toString = function() {
  return JSON.stringify({
    uuid: this.uuid,
    name: this.name,
    type: this.type
  });
};

RemoteDescriptor.prototype.readValue = function(callback) {
  if (callback) {
    this.once('valueRead', function(data) {
      callback(null, data);
    });
  }
  this._able.readValue(
    this._peripheralId,
    this._serviceUuid,
    this._characteristicUuid,
    this.uuid
  );
};

RemoteDescriptor.prototype.writeValue = function(data, callback) {
  if (!(data instanceof Buffer)) {
    throw new Error('data must be a Buffer');
  }

  if (callback) {
    this.once('valueWrite', function() {
      callback(null);
    });
  }
  this._able.writeValue(
    this._peripheralId,
    this._serviceUuid,
    this._characteristicUuid,
    this.uuid,
    data
  );
};

module.exports = RemoteDescriptor;
