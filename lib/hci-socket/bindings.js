var debug = require('debug')('bindings');

var events = require('events');
var util = require('util');

var AclStream = require('./acl-stream');
var Gatt = require('./gatt');
var LocalGatt = require('./local-gatt');
var Gap = require('./gap');
var Hci = require('./hci');


var AbleBindings = function() {
  this._state = null;

  this._addresses = {};
  this._addresseTypes = {};
  this._connectable = {};

  this._pendingConnection = false;
  this._connectionQueue = [];

  this._handles = {};
  this._gatts = {};
  this._aclStreams = {};

  this._hci = new Hci();
  this._gatt = new LocalGatt(this._hci);
  this._gap = new Gap(this._hci);
};

util.inherits(AbleBindings, events.EventEmitter);




AbleBindings.prototype.startScanning = function(serviceUuids, allowDuplicates) {
  this._scanServiceUuids = serviceUuids || [];

  this._gap.startScanning(allowDuplicates);
};

AbleBindings.prototype.stopScanning = function() {
  this._gap.stopScanning();
};

AbleBindings.prototype.connect = function(peripheralUuid) {
  var address = this._addresses[peripheralUuid];
  var addressType = this._addresseTypes[peripheralUuid];

  console.log("Connect - uuid: " + peripheralUuid + " addres: " + address);
  if (!this._pendingConnection) {
    this._pendingConnection = true;

    this._hci.createLeConn(address, addressType);
  } else {
    this._connectionQueue.push(peripheralUuid);
  }
};

AbleBindings.prototype.disconnect = function(peripheralUuid) {
  this._hci.disconnect(this._handles[peripheralUuid]);
};

AbleBindings.prototype.updateRssi = function(peripheralUuid) {
  this._hci.readRssi(this._handles[peripheralUuid]);
};

AbleBindings.prototype.init = function() {
  this.onSigIntBinded = this.onSigInt.bind(this);

  process.on('SIGINT', this.onSigIntBinded);
  process.on('exit', this.onExit.bind(this));

  this._gatt.on('handleMtuRequest', this.onMtu.bind(this));

  this._gap.on('advertisingStart', this.onAdvertisingStart.bind(this));
  this._gap.on('advertisingStop', this.onAdvertisingStop.bind(this));

  this._hci.on('addressChange', this.onAddressChange.bind(this));

  
  this._gap.on('scanStart', this.onScanStart.bind(this));
  this._gap.on('scanStop', this.onScanStop.bind(this));
  this._gap.on('discover', this.onDiscover.bind(this));

  this._hci.on('stateChange', this.onStateChange.bind(this));
  this._hci.on('leConnComplete', this.onLeConnComplete.bind(this));
  this._hci.on('leConnUpdateComplete', this.onLeConnUpdateComplete.bind(this));
  this._hci.on('rssiRead', this.onRssiRead.bind(this));
  this._hci.on('disconnComplete', this.onDisconnComplete.bind(this));
  this._hci.on('encryptChange', this.onEncryptChange.bind(this));
  this._hci.on('leLtkNegReply', this.onLeLtkNegReply.bind(this));
  this._hci.on('aclDataPkt', this.onAclDataPkt.bind(this));

  this._hci.init();
};


AbleBindings.prototype.onSigInt = function() {
  var sigIntListeners = process.listeners('SIGINT');

  if (sigIntListeners[sigIntListeners.length - 1] === this.onSigIntBinded) {
    // we are the last listener, so exit
    // this will trigger onExit, and clean up
    process.exit(1);
  }
};

AbleBindings.prototype.onExit = function() {
  this.stopScanning();

  for (var handle in this._aclStreams) {
    this._hci.disconnect(handle);
  }
  //Bleno
    this._gap.stopAdvertising();

  this.disconnect();


};


AbleBindings.prototype.onStateChange = function(state) {
  if (this._state === state) {
    return;
  }
  this._state = state;


  if (state === 'unauthorized') {
    console.log('able warning: adapter state unauthorized, please run as root or with sudo');
    console.log('               or see README for information on running without root/sudo:');
    console.log('               https://github.com/sandeepmistry/able#running-on-linux');
  } else if (state === 'unsupported') {
    console.log('able warning: adapter does not support Bluetooth Low Energy (BLE, Bluetooth Smart).');
    console.log('               Try to run with environment variable:');
    console.log('               [sudo] NOBLE_HCI_DEVICE_ID=x node ...');
  }

  this.emit('stateChange', state);
};

AbleBindings.prototype.onScanStart = function() {
  this.emit('scanStart');
};

AbleBindings.prototype.onScanStop = function() {
  this.emit('scanStop');
};

AbleBindings.prototype.onDiscover = function(status, address, addressType, connectable, advertisement, rssi) {
  if (this._scanServiceUuids === undefined) {
    return;
  }

  var serviceUuids = advertisement.serviceUuids;
  var hasScanServiceUuids = (this._scanServiceUuids.length === 0);

  if (!hasScanServiceUuids) {
    for (var i in serviceUuids) {
      hasScanServiceUuids = (this._scanServiceUuids.indexOf(serviceUuids[i]) !== -1);

      if (hasScanServiceUuids) {
        break;
      }
    }
  }

  if (hasScanServiceUuids) {
    var uuid = address.split(':').join('');
    this._addresses[uuid] = address;
    this._addresseTypes[uuid] = addressType;
    this._connectable[uuid] = connectable;

    this.emit('discover', uuid, address, addressType, connectable, advertisement, rssi);
  }
};



AbleBindings.prototype.onLeConnComplete = function(status, handle, role, addressType, address, interval, latency, supervisionTimeout, masterClockAccuracy) {
  var uuid = address.split(':').join('').toLowerCase();

  var error = null;

  debug("Conn Complete -  status: " + status + " role: " + role + " Address: " + address + " Type: " + addressType);
  if (status === 0) {
    var aclStream = new AclStream(this._hci, handle, this._hci.addressType, this._hci.address, addressType, address);
    var gatt = new Gatt(address, aclStream);

    // Bleno Code

    this._address = address;
    this._handle = handle;

    //end bleno code

    this._gatts[uuid] = this._gatts[handle] = gatt;
    this._aclStreams[handle] = aclStream;
    this._handles[uuid] = handle;
    this._handles[handle] = uuid;

 

    this._gatts[handle].on('mtu', this.onMtu.bind(this));
    this._gatts[handle].on('servicesDiscover', this.onServicesDiscovered.bind(this));
    this._gatts[handle].on('includedServicesDiscover', this.onIncludedServicesDiscovered.bind(this));
    this._gatts[handle].on('characteristicsDiscover', this.onCharacteristicsDiscovered.bind(this));
    this._gatts[handle].on('read', this.onRead.bind(this));
    this._gatts[handle].on('write', this.onWrite.bind(this));
    this._gatts[handle].on('broadcast', this.onBroadcast.bind(this));
    this._gatts[handle].on('notify', this.onNotify.bind(this));
    this._gatts[handle].on('notification', this.onNotification.bind(this));
    this._gatts[handle].on('descriptorsDiscover', this.onDescriptorsDiscovered.bind(this));
    this._gatts[handle].on('valueRead', this.onValueRead.bind(this));
    this._gatts[handle].on('valueWrite', this.onValueWrite.bind(this));
    this._gatts[handle].on('handleRead', this.onHandleRead.bind(this));
    this._gatts[handle].on('handleWrite', this.onHandleWrite.bind(this));
    this._gatts[handle].on('handleNotify', this.onHandleNotify.bind(this));
    this._gatts[handle].on('encryptFail', this.onEncryptFail.bind(this));


  } else {
    error = new Error(Hci.STATUS_MAPPER[status] || ('Unknown (' + status + ')'));
  }

  if (role == 1) {
    //bleno
    //this._gatts[handle].setServices([]);
    this._gatt.setAclStream(aclStream);
    this._gatts[handle]._handles = [];
    console.log("Bleno: Handle: " + handle + " UUID: " + uuid + " address " + address);
        if (this._connectionQueue.length > 0) {
      var peripheralUuid = this._connectionQueue.shift();
      console.log("Perh: " + peripheralUuid + " address: " + address);
    }

    this._addresses[uuid] = address;
    this._addresseTypes[uuid] = addressType;

    this.emit('accept', uuid, addressType,address);
    return;
  } else {
    this._gatts[handle].exchangeMtu(256);
    this.emit('connect', uuid, error);

    if (this._connectionQueue.length > 0) {
      var peripheralUuid = this._connectionQueue.shift();

      address = this._addresses[peripheralUuid];
      addressType = this._addresseTypes[peripheralUuid];

      this._hci.createLeConn(address, addressType);
    } else {
      this._pendingConnection = false;
    }
  }
};

AbleBindings.prototype.onLeConnUpdateComplete = function(handle, interval, latency, supervisionTimeout) {
  // no-op
  debug("What!!?!");
};

AbleBindings.prototype.onDisconnComplete = function(handle, reason) {
  debug('disconnComplete');
  var uuid = this._handles[handle];
  debug('\t\tHande:' + handle + '\tuuid: ' + uuid );
  if (uuid) {
    this._aclStreams[handle].push(null, null);
    this._gatts[handle].removeAllListeners();

    delete this._gatts[uuid];
    delete this._gatts[handle];
    delete this._aclStreams[handle];
    delete this._handles[uuid];
    delete this._handles[handle];
    debug('\t\tEmmitting disconnect');
    this.emit('disconnect', uuid); // TODO: handle reason?
  } else {
    debug('unknown handle ' + handle + ' disconnected!');
  }
    //This is for Bleno
    if (this._aclStream) {
      this._aclStream.push(null, null);
    }

    var address = this._address;

    this._address = null;
    this._handle = null;
    this._aclStream = null;

    if (address) {
      debug('\t\tEmmitting disconnect');
      this.emit('disconnect', address); // TODO: use reason
    }

    if (this._advertising) {
      debug('\t\tRestarting adverstising');
      this._gap.restartAdvertising();
    }

};

AbleBindings.prototype.onDisconnComplete = function(handle, reason) {

};




AbleBindings.prototype.onLeLtkNegReply = function(handle) {
  if (this._handle === handle && this._aclStream) {
    this._aclStream.pushLtkNegReply();
  }
};

AbleBindings.prototype.onEncryptFail = function(aclStream) {
  /*  if (this._handle === handle && this._aclStream) {
    this._aclStream.pushEncrypt(encrypt);
  }*/
  debug("onEncryptFail");

/*
  if (aclStream) {
    debug("Trying Pairing Again");
    aclStream.pushEncrypt(true);
  }*/
};


AbleBindings.prototype.onEncryptChange = function(handle, encrypt) {
  /*  if (this._handle === handle && this._aclStream) {
    this._aclStream.pushEncrypt(encrypt);
  }*/
 

  var aclStream = this._aclStreams[handle];
 debug("onEncryptChange: " + handle);
this.emit("encryptChange");
  if (aclStream) {
    aclStream.pushEncrypt(encrypt);
  }
};

AbleBindings.prototype.onMtu = function(address, mtu) {
 this.emit('mtuChange', mtu);
};




AbleBindings.prototype.onRssiRead = function(handle, rssi) {
  this.emit('rssiUpdate', this._handles[handle], rssi);

  /* Bleno
   this.emit('rssiUpdate', rssi);
  */
};


AbleBindings.prototype.onAclDataPkt = function(handle, cid, data) {
  var aclStream = this._aclStreams[handle];

  if (aclStream) {
    aclStream.push(cid, data);
  }
  /* Bleno
    if (this._handle === handle && this._aclStream) {
    this._aclStream.push(cid, data);
  }
  */
};

AbleBindings.prototype.findByTypeRequest = function(peripheralUuid, startHandle, endHandle, uuid, value) {
  var handle = this._handles[peripheralUuid];
  var gatt = this._gatts[handle];
  if (gatt) {
    gatt.findByTypeRequest(startHandle, endHandle, uuid, value);
  } else {
    console.warn('able warning: FindByTypeRequest unknown peripheral ' + peripheralUuid);
  }

}


AbleBindings.prototype.discoverServices = function(peripheralUuid, uuids) {
  var handle = this._handles[peripheralUuid];
  var gatt = this._gatts[handle];

  if (gatt) {
    gatt.discoverServices(uuids || []);
  } else {
    console.warn('able warning: unknown peripheral ' + peripheralUuid);
  }
};

AbleBindings.prototype.onServicesDiscovered = function(address, serviceUuids) {
  var uuid = address.split(':').join('').toLowerCase();

  this.emit('servicesDiscover', uuid, serviceUuids);
};

AbleBindings.prototype.discoverIncludedServices = function(peripheralUuid, serviceUuid, serviceUuids) {
  var handle = this._handles[peripheralUuid];
  var gatt = this._gatts[handle];

  if (gatt) {
    gatt.discoverIncludedServices(serviceUuid, serviceUuids || []);
  } else {
    console.warn('able warning: unknown peripheral ' + peripheralUuid);
  }
};

AbleBindings.prototype.onIncludedServicesDiscovered = function(address, serviceUuid, includedServiceUuids) {
  var uuid = address.split(':').join('').toLowerCase();

  this.emit('includedServicesDiscover', uuid, serviceUuid, includedServiceUuids);
};

AbleBindings.prototype.discoverCharacteristics = function(peripheralUuid, serviceUuid, characteristicUuids) {
  var handle = this._handles[peripheralUuid];
  var gatt = this._gatts[handle];

  if (gatt) {
    gatt.discoverCharacteristics(serviceUuid, characteristicUuids || []);
  } else {
    console.warn('able warning: unknown peripheral ' + peripheralUuid);
  }
};

AbleBindings.prototype.onCharacteristicsDiscovered = function(address, serviceUuid, characteristics) {
  var uuid = address.split(':').join('').toLowerCase();

  this.emit('characteristicsDiscover', uuid, serviceUuid, characteristics);
};

AbleBindings.prototype.read = function(peripheralUuid, serviceUuid, characteristicUuid) {
  var handle = this._handles[peripheralUuid];
  var gatt = this._gatts[handle];

  if (gatt) {
    gatt.read(serviceUuid, characteristicUuid);
  } else {
    console.warn('able warning: unknown peripheral ' + peripheralUuid);
  }
};

AbleBindings.prototype.onRead = function(address, serviceUuid, characteristicUuid, data) {
  var uuid = address.split(':').join('').toLowerCase();

  this.emit('read', uuid, serviceUuid, characteristicUuid, data, false);
};

AbleBindings.prototype.write = function(peripheralUuid, serviceUuid, characteristicUuid, data, withoutResponse) {
  var handle = this._handles[peripheralUuid];
  var gatt = this._gatts[handle];

  if (gatt) {
    gatt.write(serviceUuid, characteristicUuid, data, withoutResponse);
  } else {
    console.warn('able warning: unknown peripheral ' + peripheralUuid);
  }
};

AbleBindings.prototype.onWrite = function(address, serviceUuid, characteristicUuid) {
  var uuid = address.split(':').join('').toLowerCase();

  this.emit('write', uuid, serviceUuid, characteristicUuid);
};

AbleBindings.prototype.broadcast = function(peripheralUuid, serviceUuid, characteristicUuid, broadcast) {
  var handle = this._handles[peripheralUuid];
  var gatt = this._gatts[handle];

  if (gatt) {
    gatt.broadcast(serviceUuid, characteristicUuid, broadcast);
  } else {
    console.warn('able warning: unknown peripheral ' + peripheralUuid);
  }
};

AbleBindings.prototype.onBroadcast = function(address, serviceUuid, characteristicUuid, state) {
  var uuid = address.split(':').join('').toLowerCase();

  this.emit('broadcast', uuid, serviceUuid, characteristicUuid, state);
};

AbleBindings.prototype.notify = function(peripheralUuid, serviceUuid, characteristicUuid, notify) {
  var handle = this._handles[peripheralUuid];
  var gatt = this._gatts[handle];

  if (gatt) {
    gatt.notify(serviceUuid, characteristicUuid, notify);
  } else {
    console.warn('able warning: unknown peripheral ' + peripheralUuid);
  }
};

AbleBindings.prototype.onNotify = function(address, serviceUuid, characteristicUuid, state) {
  var uuid = address.split(':').join('').toLowerCase();

  this.emit('notify', uuid, serviceUuid, characteristicUuid, state);
};

AbleBindings.prototype.onNotification = function(address, serviceUuid, characteristicUuid, data) {
  var uuid = address.split(':').join('').toLowerCase();

  this.emit('read', uuid, serviceUuid, characteristicUuid, data, true);
};

AbleBindings.prototype.discoverDescriptors = function(peripheralUuid, serviceUuid, characteristicUuid) {
  var handle = this._handles[peripheralUuid];
  var gatt = this._gatts[handle];

  if (gatt) {
    gatt.discoverDescriptors(serviceUuid, characteristicUuid);
  } else {
    console.warn('able warning: unknown peripheral ' + peripheralUuid);
  }
};

AbleBindings.prototype.onDescriptorsDiscovered = function(address, serviceUuid, characteristicUuid, descriptorUuids) {
  var uuid = address.split(':').join('').toLowerCase();

  this.emit('descriptorsDiscover', uuid, serviceUuid, characteristicUuid, descriptorUuids);
};

AbleBindings.prototype.readValue = function(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid) {
  var handle = this._handles[peripheralUuid];
  var gatt = this._gatts[handle];

  if (gatt) {
    gatt.readValue(serviceUuid, characteristicUuid, descriptorUuid);
  } else {
    console.warn('able warning: unknown peripheral ' + peripheralUuid);
  }
};

AbleBindings.prototype.onValueRead = function(address, serviceUuid, characteristicUuid, descriptorUuid, data) {
  var uuid = address.split(':').join('').toLowerCase();

  this.emit('valueRead', uuid, serviceUuid, characteristicUuid, descriptorUuid, data);
};

AbleBindings.prototype.writeValue = function(peripheralUuid, serviceUuid, characteristicUuid, descriptorUuid, data) {
  var handle = this._handles[peripheralUuid];
  var gatt = this._gatts[handle];

  if (gatt) {
    gatt.writeValue(serviceUuid, characteristicUuid, descriptorUuid, data);
  } else {
    console.warn('able warning: unknown peripheral ' + peripheralUuid);
  }
};

AbleBindings.prototype.onValueWrite = function(address, serviceUuid, characteristicUuid, descriptorUuid) {
  var uuid = address.split(':').join('').toLowerCase();

  this.emit('valueWrite', uuid, serviceUuid, characteristicUuid, descriptorUuid);
};

AbleBindings.prototype.readHandle = function(peripheralUuid, attHandle) {
  var handle = this._handles[peripheralUuid];
  var gatt = this._gatts[handle];

  if (gatt) {
    gatt.readHandle(attHandle);
  } else {
    console.warn('able warning: unknown peripheral ' + peripheralUuid);
  }
};

AbleBindings.prototype.onHandleRead = function(address, handle, data) {
  var uuid = address.split(':').join('').toLowerCase();

  this.emit('handleRead', uuid, handle, data);
};

AbleBindings.prototype.writeHandle = function(peripheralUuid, attHandle, data, withoutResponse) {
  var handle = this._handles[peripheralUuid];
  var gatt = this._gatts[handle];

  if (gatt) {
    gatt.writeHandle(attHandle, data, withoutResponse);
  } else {
    console.warn('able warning: unknown peripheral ' + peripheralUuid);
  }
};

AbleBindings.prototype.onHandleWrite = function(address, handle) {
  var uuid = address.split(':').join('').toLowerCase();

  this.emit('handleWrite', uuid, handle);
};

AbleBindings.prototype.onHandleNotify = function(address, handle, data) {
  var uuid = address.split(':').join('').toLowerCase();

  this.emit('handleNotify', uuid, handle, data);
};

AbleBindings.prototype.startAdvertising = function(name, serviceUuids) {
  this._advertising = true;

  this._gap.startAdvertising(name, serviceUuids);
};

AbleBindings.prototype.startAdvertisingIBeacon = function(data) {
  this._advertising = true;

  this._gap.startAdvertisingIBeacon(data);
};

AbleBindings.prototype.startAdvertisingWithEIRData = function(advertisementData, scanData) {
  this._advertising = true;

  this._gap.startAdvertisingWithEIRData(advertisementData, scanData);
};

AbleBindings.prototype.stopAdvertising = function() {
  this._advertising = false;

  this._gap.stopAdvertising();
};

AbleBindings.prototype.setServices = function(services) {
  this._gatt.setServices(services);
  debug('Trying to set services');

  this.emit('servicesSet');
};

AbleBindings.prototype.disconnect = function() {
  if (this._handle) {
    debug('disconnect by server');

    this._hci.disconnect(this._handle);
  }
};

AbleBindings.prototype.updateRssi = function() {
  if (this._handle) {
    this._hci.readRssi(this._handle);
  }
};





AbleBindings.prototype.onAddressChange = function(address) {
  this.emit('addressChange', address);
};

AbleBindings.prototype.onAdvertisingStart = function(error) {
  this.emit('advertisingStart', error);
};

AbleBindings.prototype.onAdvertisingStop = function() {
  this.emit('advertisingStop');
};










var ableBindings = new AbleBindings();

ableBindings.init();

module.exports = ableBindings;
