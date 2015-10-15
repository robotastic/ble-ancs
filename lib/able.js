var debug = require('debug')('Able');

var events = require('events');
var os = require('os');
var util = require('util');

var Peripheral = require('./peripheral');
var PrimaryService = require('./primary-service');
var Service = require('./service');
var RemoteCharacteristic = require('./remote-characteristic');
var RemoteDescriptor = require('./remote-descriptor');
var Characteristic = require('./local-characteristic');
var LocalDescriptor = require('./local-descriptor');

var bindings = null;

var platform = os.platform();

if (platform === 'linux' || platform === 'win32') {
  bindings = require('./hci-socket/bindings');
} else {
  throw new Error('Unsupported platform');
}

function Able() {
  this.state = 'unknown';

  this._bindings = bindings;
  this._peripherals = {};
  this._services = {};
  this._characteristics = {};
  this._descriptors = {};
  this._discoveredPeripheralUUids = [];
  this._allowDuplicates = true;
  this._bindings._scanServiceUuids = [];

  this._bindings.on('stateChange', this.onStateChange.bind(this));
  this._bindings.on('addressChange', this.onAddressChange.bind(this));
  this._bindings.on('advertisingStart', this.onAdvertisingStart.bind(this));
  this._bindings.on('advertisingStop', this.onAdvertisingStop.bind(this));
  this._bindings.on('servicesSet', this.onServicesSet.bind(this));
  this._bindings.on('accept', this.onAccept.bind(this));
  this._bindings.on('mtuChange', this.onMtuChange.bind(this));
  this._bindings.on('disconnect', this.onDisconnect.bind(this));
  this._bindings.on('scanStart', this.onScanStart.bind(this));
  this._bindings.on('scanStop', this.onScanStop.bind(this));
  this._bindings.on('discover', this.onDiscover.bind(this));
  this._bindings.on('connect', this.onConnect.bind(this));
  this._bindings.on('rssiUpdate', this.onRssiUpdate.bind(this));
  this._bindings.on('servicesDiscover', this.onServicesDiscover.bind(this));
  this._bindings.on('includedServicesDiscover', this.onIncludedServicesDiscover.bind(this));
  this._bindings.on('characteristicsDiscover', this.onCharacteristicsDiscover.bind(this));
  this._bindings.on('read', this.onRead.bind(this));
  this._bindings.on('write', this.onWrite.bind(this));
  this._bindings.on('broadcast', this.onBroadcast.bind(this));
  this._bindings.on('notify', this.onNotify.bind(this));
  this._bindings.on('encryptChange', this.onEncryptChange.bind(this));
  this._bindings.on('encryptFail', this.onEncryptFail.bind(this));
  this._bindings.on('descriptorsDiscover', this.onDescriptorsDiscover.bind(this));
  this._bindings.on('valueRead', this.onValueRead.bind(this));
  this._bindings.on('valueWrite', this.onValueWrite.bind(this));
  this._bindings.on('handleRead', this.onHandleRead.bind(this));
  this._bindings.on('handleWrite', this.onHandleWrite.bind(this));
  this._bindings.on('handleNotify', this.onHandleNotify.bind(this));

  this.on('warning', function(message) {
    if (this.listeners('warning').length === 1) {
      console.warn('Able: ' + message);
    }
  }.bind(this));
}

Able.prototype.PrimaryService = PrimaryService;
Able.prototype.Characteristic = Characteristic;
Able.prototype.Descriptor = LocalDescriptor;
util.inherits(Able, events.EventEmitter);

Able.prototype.onStateChange = function(state) {
  debug('stateChange ' + state);

  this.state = state;

  this.emit('stateChange', state);
};

Able.prototype.onEncryptChange = function() {
  debug('encryptChange' );

  this.emit('encryptChange');
};

Able.prototype.onEncryptFail = function() {
  debug('encryptFail ' );

  this.emit('encryptFail');
};

Able.prototype.onAddressChange = function(address) {
  debug('addressChange ' + address);

  this.address = address;
};

Able.prototype.onAccept = function(uuid, address, addressType) {
  debug('accept ' + address);

  var peripheral = this._peripherals[uuid];
  var connectable = true;
  var advertisement = {
    localName: undefined,
    txPowerLevel: undefined,
    manufacturerData: undefined,
    serviceData: [],
    serviceUuids: []

  };
  var rssi = 127;

  if (!peripheral) {
    peripheral = new Peripheral(this, uuid, address, addressType, connectable, advertisement, rssi);
    peripheral.state = 'connected';
    this._peripherals[uuid] = peripheral;
    this._services[uuid] = {};
    this._characteristics[uuid] = {};
    this._descriptors[uuid] = {};
  } else {
    // "or" the advertisment data with existing
 /*
    for (var i in advertisement) {
      if (advertisement[i] !== undefined) {
        peripheral.advertisement[i] = advertisement[i];
      }
    }*/

    peripheral.rssi = rssi;
  }

  var previouslyDiscoverd = (this._discoveredPeripheralUUids.indexOf(uuid) !== -1);

  if (!previouslyDiscoverd) {
    this._discoveredPeripheralUUids.push(uuid);
  }

  this.emit('accept', peripheral);
};

Able.prototype.onMtuChange = function(mtu) {
  debug('mtu ' + mtu);

  this.mtu = mtu;

  this.emit('mtuChange', mtu);
};


Able.prototype.startScanning = function(serviceUuids, allowDuplicates, callback) {
  debug("Starting SCcanning");
  if (this.state !== 'poweredOn') {
    var error = new Error('Could not start scanning, state is ' + this.state + ' (not poweredOn)');

    if (typeof callback === 'function') {
      callback(error);
    } else {
      throw error;
    }
  } else {
    if (callback) {
      this.once('scanStart', callback);
    }

    this._discoveredPeripheralUUids = [];
    this._allowDuplicates = allowDuplicates;

    this._bindings.startScanning(serviceUuids, allowDuplicates);
  }
};

Able.prototype.onScanStart = function() {
  debug('scanStart');
  this.emit('scanStart');
};

Able.prototype.stopScanning = function(callback) {
  if (callback) {
    this.once('scanStop', callback);
  }
  this._bindings.stopScanning();
};

Able.prototype.onScanStop = function() {
  debug('scanStop');
  this.emit('scanStop');
};

Able.prototype.onDiscover = function(uuid, address, addressType, connectable, advertisement, rssi) {
  var peripheral = this._peripherals[uuid];

  if (!peripheral) {
    peripheral = new Peripheral(this, uuid, address, addressType, connectable, advertisement, rssi);

    this._peripherals[uuid] = peripheral;
    this._services[uuid] = {};
    this._characteristics[uuid] = {};
    this._descriptors[uuid] = {};
  } else {
    // "or" the advertisment data with existing
    for (var i in advertisement) {
      if (advertisement[i] !== undefined) {
        peripheral.advertisement[i] = advertisement[i];
      }
    }

    peripheral.rssi = rssi;
  }

  var previouslyDiscoverd = (this._discoveredPeripheralUUids.indexOf(uuid) !== -1);

  if (!previouslyDiscoverd) {
    this._discoveredPeripheralUUids.push(uuid);
  }

  if (this._allowDuplicates || !previouslyDiscoverd) {
    this.emit('discover', peripheral);
  }
};

Able.prototype.connect = function(peripheralUuid) {
  this._bindings.connect(peripheralUuid);
};

Able.prototype.onConnect = function(peripheralUuid, error) {
  var peripheral = this._peripherals[peripheralUuid];

  if (peripheral) {
    peripheral.state = error ? 'error' : 'connected';
    peripheral.emit('connect', error);
  } else {
    this.emit('warning', 'unknown peripheral ' + peripheralUuid + ' connected!');
  }
};

Able.prototype.disconnect = function(peripheralUuid) {
  this._bindings.disconnect(peripheralUuid);
};

Able.prototype.onDisconnect = function(peripheralUuid) {
  var peripheral = this._peripherals[peripheralUuid];
  debug("recieved disconnect");
  this.emit('disconnect');
  if (peripheral) {
    peripheral.state = 'disconnected';
    peripheral.emit('disconnect');
  } else {
    debug('unknown peripheral ' + peripheralUuid + ' disconnected!');
    this.emit('warning', 'unknown peripheral ' + peripheralUuid + ' disconnected!');
  }
};

Able.prototype.updateRssi = function(peripheralUuid) {
  this._bindings.updateRssi(peripheralUuid);
};

Able.prototype.onRssiUpdate = function(peripheralUuid, rssi) {
  var peripheral = this._peripherals[peripheralUuid];

  if (peripheral) {
    peripheral.rssi = rssi;

    peripheral.emit('rssiUpdate', rssi);
  } else {
    this.emit('warning', 'unknown peripheral ' + peripheralUuid + ' RSSI update!');
  }
};

Able.prototype.findHandlesForUuid = function(peripheralUuid, uuid)
{
  var uuidBuf = new Buffer(uuid, 'hex');
  this._bindings.findByTypeRequest(peripheralUuid, 0x0001,0xffff, 0x2800, uuidBuf);
}

Able.prototype.findService = function(peripheralUuid, uuid)
{
  var uuidBuf = new Buffer(uuid, 'hex');
  this._bindings.findByTypeRequest(peripheralUuid, 0x0001,0xffff, 0x2800, uuidBuf);
}

Able.prototype.discoverServices = function(peripheralUuid, uuids) {
  this._bindings.discoverServices(peripheralUuid, uuids);
};

Able.prototype.onServicesDiscover = function(peripheralUuid, serviceUuids) {
  var peripheral = this._peripherals[peripheralUuid];

  if (peripheral) {
    var services = [];

    for (var i = 0; i < serviceUuids.length; i++) {
      var serviceUuid = serviceUuids[i];
      var service = new Service(this, peripheralUuid, serviceUuid);

      this._services[peripheralUuid][serviceUuid] = service;
      this._characteristics[peripheralUuid][serviceUuid] = {};
      this._descriptors[peripheralUuid][serviceUuid] = {};

      services.push(service);
    }

    peripheral.services = services;

    peripheral.emit('servicesDiscover', services);
  } else {
    this.emit('warning', 'unknown peripheral ' + peripheralUuid + ' services discover!');
  }
};

Able.prototype.discoverIncludedServices = function(peripheralUuid, serviceUuid, serviceUuids) {
  this._bindings.discoverIncludedServices(peripheralUuid, serviceUuid, serviceUuids);
};

Able.prototype.onIncludedServicesDiscover = function(peripheralUuid, serviceUuid, includedServiceUuids) {
  var service = this._services[peripheralUuid][serviceUuid];

  if (service) {
    service.includedServiceUuids = includedServiceUuids;

    service.emit('includedServicesDiscover', includedServiceUuids);
  } else {
    this.emit('warning', 'unknown peripheral ' + peripheralUuid + ', ' + serviceUuid + ' included services discover!');
  }
};

Able.prototype.discoverCharacteristics = function(peripheralUuid, serviceUuid, characteristicUuids) {
  this._bindings.discoverCharacteristics(peripheralUuid, serviceUuid, characteristicUuids);
};

Able.prototype.onCharacteristicsDiscover = function(peripheralUuid, serviceUuid, characteristics) {
  var service = this._services[peripheralUuid][serviceUuid];

  if (service) {
    var characteristics_ = [];

    for (var i = 0; i < characteristics.length; i++) {
      var characteristicUuid = characteristics[i].uuid;

      var characteristic = new RemoteCharacteristic(
                                this,
                                peripheralUuid,
                                serviceUuid,
                                characteristicUuid,
                                characteristics[i].properties
                            );

      this._characteristics[peripheralUuid][serviceUuid][characteristicUuid] = characteristic;
      this._descriptors[peripheralUuid][serviceUuid][characteristicUuid] = {};

      characteristics_.push(characteristic);
    }

    service.characteristics = characteristics_;

    service.emit('characteristicsDiscover', characteristics_);
  } else {
    this.emit('warning', 'unknown peripheral ' + peripheralUuid + ', ' + serviceUuid + ' characteristics discover!');
  }
};

Able.prototype.read = function(peripheralUuid, serviceUuid, characteristicUuid) {
   this._bindings.read(peripheralUuid, serviceUuid, characteristicUuid);
};

Able.prototype.onRead = function(peripheralUuid, serviceUuid, characteristicUuid, data, isNotification) {
  var characteristic = this._characteristics[peripheralUuid][serviceUuid][characteristicUuid];

  if (characteristic) {
    characteristic.emit('data', data, isNotification);

    characteristic.emit('read', data, isNotification); // for backwards compatbility
  } else {
    this.emit('warning', 'unknown peripheral ' + peripheralUuid + ', ' + serviceUuid + ', ' + characteristicUuid + ' read!');
  }
};

Able.prototype.write = function(peripheralUuid, serviceUuid, characteristicUuid, data, withoutResponse) {
   this._bindings.write(peripheralUuid, serviceUuid, characteristicUuid, data, withoutResponse);
};

Able.prototype.onWrite = function(peripheralUuid, serviceUuid, characteristicUuid) {
  var characteristic = this._characteristics[peripheralUuid][serviceUuid][characteristicUuid];

  if (characteristic) {
    characteristic.emit('write');
  } else {
    this.emit('warning', 'unknown peripheral ' + peripheralUuid + ', ' + serviceUuid + ', ' + characteristicUuid + ' write!');
  }
};

Able.prototype.broadcast = function(peripheralUuid, serviceUuid, characteristicUuid, broadcast) {
   this._bindings.broadcast(peripheralUuid, serviceUuid, characteristicUuid, broadcast);
};

Able.prototype.onBroadcast = function(peripheralUuid, serviceUuid, characteristicUuid, state) {
  var characteristic = this._characteristics[peripheralUuid][serviceUuid][characteristicUuid];

  if (characteristic) {
    characteristic.emit('broadcast', state);
  } else {
    this.emit('warning', 'unknown peripheral ' + peripheralUuid + ', ' + serviceUuid + ', ' + characteristicUuid + ' broadcast!');
  }
};

Able.prototype.notify = function(peripheralUuid, serviceUuid, characteristicUuid, notify) {
   this._bindings.notify(peripheralUuid, serviceUuid, characteristicUuid, notify);
};

Able.prototype.onNotify = function(peripheralUuid, serviceUuid, characteristicUuid, state) {
  var characteristic = this._characteristics[peripheralUuid][serviceUuid][characteristicUuid];

  if (characteristic) {
    characteristic.emit('notify', state);
  } else {
    this.emit('warning', 'unknown peripheral ' + peripheralUuid + ', ' + serviceUuid + ', ' + characteristicUuid + ' notify!');
  }
};

Able.prototype.discoverDescriptors = function(peripheralUuid, serviceUuid, characteristicUuid) {
  this._bindings.discoverDescriptors(peripheralUuid, serviceUuid, characteristicUuid);
};

Able.prototype.onDescriptorsDiscover = function(peripheralUuid, serviceUuid, characteristicUuid, descriptors) {
  var characteristic = this._characteristics[peripheralUuid][serviceUuid][characteristicUuid];

  if (characteristic) {
    var descriptors_ = [];

    for (var i = 0; i < descriptors.length; i++) {
      var descriptorUuid = descriptors[i];

      var descriptor = new Descriptor(
                            this,
                            peripheralUuid,
                            serviceUuid,
                            characteristicUuid,
                            descriptorUuid
                        );

      this._descriptors[peripheralUuid][serviceUuid][characteristicUuid][descriptorUuid] = descriptor;

      descriptors_.push(descriptor);
    }

    characteristic.descriptors = descriptors_;

    characteristic.emit('descriptorsDiscover', descriptors_);
  } else {
    this.emit('warning', 'unknown peripheral ' + peripheralUuid + ', ' + serviceUuid + ', ' + characteristicUuid + ' descriptors discover!');
  }
};

Able.prototype.readValue = function(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid) {
  this._bindings.readValue(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid);
};

Able.prototype.onValueRead = function(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid, data) {
  var descriptor = this._descriptors[peripheralUuid][serviceUuid][characteristicUuid][descriptorUuid];

  if (descriptor) {
    descriptor.emit('valueRead', data);
  } else {
    this.emit('warning', 'unknown peripheral ' + peripheralUuid + ', ' + serviceUuid + ', ' + characteristicUuid + ', ' + descriptorUuid + ' value read!');
  }
};

Able.prototype.writeValue = function(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid, data) {
  this._bindings.writeValue(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid, data);
};

Able.prototype.onValueWrite = function(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid) {
  var descriptor = this._descriptors[peripheralUuid][serviceUuid][characteristicUuid][descriptorUuid];

  if (descriptor) {
    descriptor.emit('valueWrite');
  } else {
    this.emit('warning', 'unknown peripheral ' + peripheralUuid + ', ' + serviceUuid + ', ' + characteristicUuid + ', ' + descriptorUuid + ' value write!');
  }
};

Able.prototype.readHandle = function(peripheralUuid, handle) {
  this._bindings.readHandle(peripheralUuid, handle);
};

Able.prototype.onHandleRead = function(peripheralUuid, handle, data) {
  var peripheral = this._peripherals[peripheralUuid];

  if (peripheral) {
    peripheral.emit('handleRead' + handle, data);
  } else {
    this.emit('warning', 'unknown peripheral ' + peripheralUuid + ' handle read!');
  }
};

Able.prototype.writeHandle = function(peripheralUuid, handle, data, withoutResponse) {
  this._bindings.writeHandle(peripheralUuid, handle, data, withoutResponse);
};

Able.prototype.onHandleWrite = function(peripheralUuid, handle) {
  var peripheral = this._peripherals[peripheralUuid];

  if (peripheral) {
    peripheral.emit('handleWrite' + handle);
  } else {
    this.emit('warning', 'unknown peripheral ' + peripheralUuid + ' handle write!');
  }
};

Able.prototype.onHandleNotify = function(peripheralUuid, handle, data) {
  var peripheral = this._peripherals[peripheralUuid];

  if (peripheral) {
    peripheral.emit('handleNotify', handle, data);
  } else {
    this.emit('warning', 'unknown peripheral ' + peripheralUuid + ' handle notify!');
  }
};

/*Bleno start */

Able.prototype.startAdvertising = function(name, serviceUuids, callback) {
  if (this.state !== 'poweredOn') {
    var error = new Error('Could not start advertising, state is ' + this.state + ' (not poweredOn)');

    if (typeof callback === 'function') {
      callback(error);
    } else {
      throw error;
    }
  } else {
    if (callback) {
      this.once('advertisingStart', callback);
    }

    var undashedServiceUuids = [];

    if (serviceUuids && serviceUuids.length) {
      for (var i = 0; i < serviceUuids.length; i++) {
        undashedServiceUuids[i] = UuidUtil.removeDashes(serviceUuids[i]);
      }
    }

    this._bindings.startAdvertising(name, undashedServiceUuids);
  }
};

Able.prototype.startAdvertisingIBeacon = function(uuid, major, minor, measuredPower, callback) {
  if (this.state !== 'poweredOn') {
    var error = new Error('Could not start advertising, state is ' + this.state + ' (not poweredOn)');

    if (typeof callback === 'function') {
      callback(error);
    } else {
      throw error;
    }
  } else {
    var undashedUuid =  UuidUtil.removeDashes(uuid);
    var uuidData = new Buffer(undashedUuid, 'hex');
    var uuidDataLength = uuidData.length;
    var iBeaconData = new Buffer(uuidData.length + 5);

    for (var i = 0; i < uuidDataLength; i++) {
      iBeaconData[i] = uuidData[i];
    }

    iBeaconData.writeUInt16BE(major, uuidDataLength);
    iBeaconData.writeUInt16BE(minor, uuidDataLength + 2);
    iBeaconData.writeInt8(measuredPower, uuidDataLength + 4);

    if (callback) {
      this.once('advertisingStart', callback);
    }

    debug('iBeacon data = ' + iBeaconData.toString('hex'));

    this._bindings.startAdvertisingIBeacon(iBeaconData);
  }
};

Able.prototype.onAdvertisingStart = function(error) {
  debug('advertisingStart: ' + error);

  if (error) {
    this.emit('advertisingStartError', error);
  }

  this.emit('advertisingStart', error);
};

if (platform === 'linux') {
  // Linux only API
  Able.prototype.startAdvertisingWithEIRData = function(advertisementData, scanData, callback) {
    if (this.state !== 'poweredOn') {
      var error = new Error('Could not advertising scanning, state is ' + this.state + ' (not poweredOn)');

      if (typeof callback === 'function') {
        callback(error);
      } else {
        throw error;
      }
    } else {
      if (callback) {
        this.once('advertisingStart', callback);
      }
      this._bindings.startAdvertisingWithEIRData(advertisementData, scanData);
    }
  };
} 


Able.prototype.stopAdvertising = function(callback) {
  if (callback) {
    this.once('advertisingStop', callback);
  }
  this._bindings.stopAdvertising();
};

Able.prototype.onAdvertisingStop = function() {
  debug('advertisingStop');
  this.emit('advertisingStop');
};

Able.prototype.setServices = function(services, callback) {
  if (callback) {
    this.once('servicesSet', callback);
  }
  this._bindings.setServices(services);
};

Able.prototype.onServicesSet = function(error) {
  debug('servicesSet');

  if (error) {
    this.emit('servicesSetError', error);
  }

  this.emit('servicesSet', error);
};

if (platform === 'linux') {
  // Linux only API
  Able.prototype.disconnect = function() {
    debug('disconnect');
    this._bindings.disconnect();
  };
}

Able.prototype.updateRssi = function(callback) {
  if (callback) {
    this.once('rssiUpdate', function(rssi) {
      callback(null, rssi);
    });
  }

  this._bindings.updateRssi();
};

Able.prototype.onRssiUpdate = function(rssi) {
  this.emit('rssiUpdate', rssi);
};

/* Able End */

module.exports = Able;
