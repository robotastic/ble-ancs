var debug = require('debug')('gap');

var events = require('events');
var util = require('util');

var Gap = function(hci) {
 this._hci = hci;

  this._advertiseState = null;

  this._hci.on('error', this.onHciError.bind(this));

  this._scanState = null;
  this._discoveries = {};

  this._hci.on('error', this.onHciError.bind(this));
  this._hci.on('leScanParametersSet', this.onHciLeScanParametersSet.bind(this));
  this._hci.on('leScanEnableSet', this.onHciLeScanEnableSet.bind(this));
  this._hci.on('leAdvertisingReport', this.onHciLeAdvertisingReport.bind(this));


  //Bleno
  this._hci.on('leAdvertisingParametersSet', this.onHciLeAdvertisingParametersSet.bind(this));
  this._hci.on('leAdvertisingDataSet', this.onHciLeAdvertisingDataSet.bind(this));
  this._hci.on('leScanResponseDataSet', this.onHciLeScanResponseDataSet.bind(this));
  this._hci.on('leAdvertiseEnableSet', this.onHciLeAdvertiseEnableSet.bind(this));
};

util.inherits(Gap, events.EventEmitter);

Gap.prototype.startScanning = function(allowDuplicates) {
  this._scanState = 'starting';

  this._hci.setScanEnabled(true, !allowDuplicates);
};

Gap.prototype.stopScanning = function() {
  this._scanState = 'stopping';

  this._hci.setScanEnabled(false, true);
};

Gap.prototype.onHciError = function(error) {

};

Gap.prototype.onHciLeScanParametersSet = function() {

};

Gap.prototype.onHciLeScanEnableSet = function() {
  if (this._scanState === 'starting') {
    this._scanState = 'stared';

    this.emit('scanStart');
  } else if (this._scanState === 'stopping') {
    this._scanState = 'stopped';

    this.emit('scanStop');
  }
};

Gap.prototype.onHciLeAdvertisingReport = function(status, type, address, addressType, eir, rssi) {
  var previouslyDiscovered = !!this._discoveries[address];
  var advertisement =  previouslyDiscovered ? this._discoveries[address].advertisement : {
    localName: undefined,
    txPowerLevel: undefined,
    manufacturerData: undefined,
    serviceData: [],
    serviceUuids: []
  };

  var discoveryCount = previouslyDiscovered ? this._discoveries[address].count : 0;
  var hasScanResponse = previouslyDiscovered ? this._discoveries[address].hasScanResponse : false;

  if (type === 0x04) {
    hasScanResponse = true;
  } else {
    // reset service data every non-scan response event
    advertisement.serviceData = [];
    advertisement.serviceUuids = [];
  }

  discoveryCount++;

  var i = 0;
  var j = 0;
  var serviceUuid = null;

  while ((i + 1) < eir.length) {
    var length = eir.readUInt8(i);

    if (length < 1) {
      debug('invalid EIR data, length = ' + length);
      break;
    }

    var eirType = eir.readUInt8(i + 1); // https://www.bluetooth.org/en-us/specification/assigned-numbers/generic-access-profile

    if ((i + length + 1) > eir.length) {
      debug('invalid EIR data, out of range of buffer length');
      break;
    }

    var bytes = eir.slice(i + 2).slice(0, length - 1);

    switch(eirType) {
      case 0x02: // Incomplete List of 16-bit Service Class UUID
      case 0x03: // Complete List of 16-bit Service Class UUIDs
        for (j = 0; j < bytes.length; j += 2) {
          serviceUuid = bytes.readUInt16LE(j).toString(16);
          if (advertisement.serviceUuids.indexOf(serviceUuid) === -1) {
            advertisement.serviceUuids.push(serviceUuid);
          }
        }
        break;

      case 0x06: // Incomplete List of 128-bit Service Class UUIDs
      case 0x07: // Complete List of 128-bit Service Class UUIDs
        for (j = 0; j < bytes.length; j += 16) {
          serviceUuid = bytes.slice(j, j + 16).toString('hex').match(/.{1,2}/g).reverse().join('');
          if (advertisement.serviceUuids.indexOf(serviceUuid) === -1) {
            advertisement.serviceUuids.push(serviceUuid);
          }
        }
        break;

      case 0x08: // Shortened Local Name
      case 0x09: // Complete Local Name»
        advertisement.localName = bytes.toString('utf8');
        break;

      case 0x0a: // Tx Power Level
        advertisement.txPowerLevel = bytes.readInt8(0);
        break;

      case 0x16: // Service Data, there can be multiple occurences
        var serviceDataUuid = bytes.slice(0, 2).toString('hex').match(/.{1,2}/g).reverse().join('');
        var serviceData = bytes.slice(2, bytes.length);

        advertisement.serviceData.push({
          uuid: serviceDataUuid,
          data: serviceData
        });
        break;

      case 0xff: // Manufacturer Specific Data
        advertisement.manufacturerData = bytes;
        break;
    }

    i += (length + 1);
  }

  debug('advertisement = ' + JSON.stringify(advertisement, null, 0));

  var connectable = (type === 0x04) ? this._discoveries[address].connectable : (type !== 0x03);

  this._discoveries[address] = {
    address: address,
    addressType: addressType,
    connectable: connectable,
    advertisement: advertisement,
    rssi: rssi,
    count: discoveryCount,
    hasScanResponse: hasScanResponse
  };

  // only report after a scan response event or more than one discovery without a scan response, so more data can be collected
  if (type === 0x04 || (discoveryCount > 1 && !hasScanResponse) || process.env.NOBLE_REPORT_ALL_HCI_EVENTS) {
    this.emit('discover', status, address, addressType, connectable, advertisement, rssi);
  }
};

/* BLENO Start*/
Gap.prototype.startAdvertising = function(name, serviceUuids) {
  debug('startAdvertising: name = ' + name + ', serviceUuids = ' + JSON.stringify(serviceUuids, null, 2));

  var advertisementDataLength = 3;
  var scanDataLength = 0;

  var serviceUuids16bit = [];
  var serviceUuids128bit = [];
  var i = 0;

  if (name && name.length) {
    scanDataLength += 2 + name.length;
  }

  if (serviceUuids && serviceUuids.length) {
    for (i = 0; i < serviceUuids.length; i++) {
      var serviceUuid = new Buffer(serviceUuids[i].match(/.{1,2}/g).reverse().join(''), 'hex');

      if (serviceUuid.length === 2) {
        serviceUuids16bit.push(serviceUuid);
      } else if (serviceUuid.length === 16) {
        serviceUuids128bit.push(serviceUuid);
      }
    }
  }

  if (serviceUuids16bit.length) {
    advertisementDataLength += 2 + 2 * serviceUuids16bit.length;
  }

  if (serviceUuids128bit.length) {
    advertisementDataLength += 2 + 16 * serviceUuids128bit.length;
  }

  var advertisementData = new Buffer(advertisementDataLength);
  var scanData = new Buffer(scanDataLength);

  // flags
  advertisementData.writeUInt8(2, 0);
  advertisementData.writeUInt8(0x01, 1);
  advertisementData.writeUInt8(0x06, 2);

  var advertisementDataOffset = 3;

  if (serviceUuids16bit.length) {
    advertisementData.writeUInt8(1 + 2 * serviceUuids16bit.length, advertisementDataOffset);
    advertisementDataOffset++;

    advertisementData.writeUInt8(0x03, advertisementDataOffset);
    advertisementDataOffset++;

    for (i = 0; i < serviceUuids16bit.length; i++) {
      serviceUuids16bit[i].copy(advertisementData, advertisementDataOffset);
      advertisementDataOffset += serviceUuids16bit[i].length;
    }
  }

  if (serviceUuids128bit.length) {
    advertisementData.writeUInt8(1 + 16 * serviceUuids128bit.length, advertisementDataOffset);
    advertisementDataOffset++;

    advertisementData.writeUInt8(0x06, advertisementDataOffset);
    advertisementDataOffset++;

    for (i = 0; i < serviceUuids128bit.length; i++) {
      serviceUuids128bit[i].copy(advertisementData, advertisementDataOffset);
      advertisementDataOffset += serviceUuids128bit[i].length;
    }
  }

  // name
  if (name && name.length) {
    var nameBuffer = new Buffer(name);

    scanData.writeUInt8(1 + nameBuffer.length, 0);
    scanData.writeUInt8(0x08, 1);
    nameBuffer.copy(scanData, 2);
  }

  this.startAdvertisingWithEIRData(advertisementData, scanData);
};


Gap.prototype.startAdvertisingIBeacon = function(data) {
  debug('startAdvertisingIBeacon: data = ' + data.toString('hex'));

  var dataLength = data.length;
  var manufacturerDataLength = 4 + dataLength;
  var advertisementDataLength = 5 + manufacturerDataLength;
  var scanDataLength = 0;

  var advertisementData = new Buffer(advertisementDataLength);
  var scanData = new Buffer(0);

  // flags
  advertisementData.writeUInt8(2, 0);
  advertisementData.writeUInt8(0x01, 1);
  advertisementData.writeUInt8(0x06, 2);

  advertisementData.writeUInt8(manufacturerDataLength + 1, 3);
  advertisementData.writeUInt8(0xff, 4);
  advertisementData.writeUInt16LE(0x004c, 5); // Apple Company Identifier LE (16 bit)
  advertisementData.writeUInt8(0x02, 7); // type, 2 => iBeacon
  advertisementData.writeUInt8(dataLength, 8);

  data.copy(advertisementData, 9);

  this.startAdvertisingWithEIRData(advertisementData, scanData);
};

Gap.prototype.startAdvertisingWithEIRData = function(advertisementData, scanData) {
  advertisementData = advertisementData || new Buffer(0);
  scanData = scanData || new Buffer(0);

  debug('startAdvertisingWithEIRData: advertisement data = ' + advertisementData.toString('hex') + ', scan data = ' + scanData.toString('hex'));

  var error = null;

  if (advertisementData.length > 31) {
    error = new Error('Advertisement data is over maximum limit of 31 bytes');
  } else if (scanData.length > 31) {
    error = new Error('Scan data is over maximum limit of 31 bytes');
  }

  if (error) {
    this.emit('advertisingStart', error);
  } else {
    this._advertiseState = 'starting';

    this._hci.setScanResponseData(scanData);
    this._hci.setAdvertisingData(advertisementData);
    this._hci.setAdvertiseEnable(true);
    //this._hci.setScanResponseData(scanData);
    //this._hci.setAdvertisingData(advertisementData);
  }
};

Gap.prototype.restartAdvertising = function() {
  this._advertiseState = 'restarting';

  this._hci.setAdvertiseEnable(true);
};

Gap.prototype.stopAdvertising = function() {
  this._advertiseState = 'stopping';

  this._hci.setAdvertiseEnable(false);
};

Gap.prototype.onHciLeAdvertisingParametersSet = function(status) {
};

Gap.prototype.onHciLeAdvertisingDataSet = function(status) {
};

Gap.prototype.onHciLeScanResponseDataSet = function(status) {
};

Gap.prototype.onHciLeAdvertiseEnableSet = function(status) {
  if (this._advertiseState === 'starting') {
    this._advertiseState = 'started';

    var error = null;

    if (status) {
      error = new Error( 'Unknown (' + status + ')');
    }

    this.emit('advertisingStart', error);
  } else if (this._advertiseState === 'stopping') {
    this._advertiseState = 'stopped';

    this.emit('advertisingStop');
  }
};

/* BLENO Stop */


module.exports = Gap;
