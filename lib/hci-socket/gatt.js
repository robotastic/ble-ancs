var debug = require('debug')('gatt');

var events = require('events');
var os = require('os');
var util = require('util');

var ATT_OP_ERROR                    = 0x01;
var ATT_OP_MTU_REQ                  = 0x02;
var ATT_OP_MTU_RESP                 = 0x03;
var ATT_OP_FIND_INFO_REQ            = 0x04;
var ATT_OP_FIND_INFO_RESP           = 0x05;
var ATT_OP_FIND_BY_TYPE_REQ         = 0x06;
var ATT_OP_FIND_BY_TYPE_RESP        = 0x07;
var ATT_OP_READ_BY_TYPE_REQ         = 0x08;
var ATT_OP_READ_BY_TYPE_RESP        = 0x09;
var ATT_OP_READ_REQ                 = 0x0a;
var ATT_OP_READ_RESP                = 0x0b;
var ATT_OP_READ_BLOB_REQ            = 0x0c;
var ATT_OP_READ_BLOB_RESP           = 0x0d;
var ATT_OP_READ_MULTI_REQ           = 0x0e;
var ATT_OP_READ_MULTI_RESP          = 0x0f;
var ATT_OP_READ_BY_GROUP_REQ        = 0x10;
var ATT_OP_READ_BY_GROUP_RESP       = 0x11;
var ATT_OP_WRITE_REQ                = 0x12;
var ATT_OP_WRITE_RESP               = 0x13;
var ATT_OP_WRITE_CMD                = 0x52;
var ATT_OP_PREP_WRITE_REQ           = 0x16;
var ATT_OP_PREP_WRITE_RESP          = 0x17;
var ATT_OP_EXEC_WRITE_REQ           = 0x18;
var ATT_OP_EXEC_WRITE_RESP          = 0x19;
var ATT_OP_HANDLE_NOTIFY            = 0x1b;
var ATT_OP_HANDLE_IND               = 0x1d;
var ATT_OP_HANDLE_CNF               = 0x1e;
var ATT_OP_WRITE_CMD                = 0x52;
var ATT_OP_SIGNED_WRITE_CMD         = 0xd2;

var GATT_PRIM_SVC_UUID              = 0x2800;
var GATT_INCLUDE_UUID               = 0x2802;
var GATT_CHARAC_UUID                = 0x2803;

var GATT_CLIENT_CHARAC_CFG_UUID     = 0x2902;
var GATT_SERVER_CHARAC_CFG_UUID     = 0x2903;

var ATT_ECODE_SUCCESS               = 0x00;
var ATT_ECODE_INVALID_HANDLE        = 0x01;
var ATT_ECODE_READ_NOT_PERM         = 0x02;
var ATT_ECODE_WRITE_NOT_PERM        = 0x03;
var ATT_ECODE_INVALID_PDU           = 0x04;
var ATT_ECODE_AUTHENTICATION        = 0x05;
var ATT_ECODE_REQ_NOT_SUPP          = 0x06;
var ATT_ECODE_INVALID_OFFSET        = 0x07;
var ATT_ECODE_AUTHORIZATION         = 0x08;
var ATT_ECODE_PREP_QUEUE_FULL       = 0x09;
var ATT_ECODE_ATTR_NOT_FOUND        = 0x0a;
var ATT_ECODE_ATTR_NOT_LONG         = 0x0b;
var ATT_ECODE_INSUFF_ENCR_KEY_SIZE  = 0x0c;
var ATT_ECODE_INVAL_ATTR_VALUE_LEN  = 0x0d;
var ATT_ECODE_UNLIKELY              = 0x0e;
var ATT_ECODE_INSUFF_ENC            = 0x0f;
var ATT_ECODE_UNSUPP_GRP_TYPE       = 0x10;
var ATT_ECODE_INSUFF_RESOURCES      = 0x11;
var ATT_CID = 0x0004;

var Gatt = function(address, aclStream) {
  this._address = address;
  this._aclStream = aclStream;

  this._services = {};
  this._characteristics = {};
  this._descriptors = {};

  this._currentCommand = null;
  this._commandQueue = [];

  this._mtu = 23;
  this._security = 'low';

  this.onAclStreamDataBinded = this.onAclStreamData.bind(this);
  this.onAclStreamEncryptBinded = this.onAclStreamEncrypt.bind(this);
  this.onAclStreamEncryptFailBinded = this.onAclStreamEncryptFail.bind(this);
  this.onAclStreamEndBinded = this.onAclStreamEnd.bind(this);

  this._aclStream.on('data', this.onAclStreamDataBinded);
  this._aclStream.on('encrypt', this.onAclStreamEncryptBinded);
  this._aclStream.on('encryptFail', this.onAclStreamEncryptFailBinded);
  this._aclStream.on('end', this.onAclStreamEndBinded);
};

util.inherits(Gatt, events.EventEmitter);

Gatt.prototype.fromJson = function(json) {
  this._address = json.address;
  this._services = json.services;
  this._characteristics = json.characteristics;
  this._descriptors = json.descriptors;
  this._mtu = json.mtu;
  this._security = json.security;
}

Gatt.prototype.toJson = function() {
  var output;
  output.address = this._address;
  output.services = this._services;
  output.characteristics = this._characteristics;
  output.descriptors = this._descriptors;
  output.mtu = this._mtu;
  output.security = this._security;

  return output;
}




Gatt.prototype.onAclStreamData = function(cid, data) {
  if (cid !== ATT_CID) {
    return;
  }

  var request = data;


  var requestType = request[0];
  var response = null;

  switch(requestType) {
    case ATT_OP_ERROR:
      debug('ATT_OP_ERROR: ' + request.toString('hex'));
      this.handleOpError(request); 
      break;
    case ATT_OP_READ_BY_TYPE_RESP:
      debug('ATT_OP_READ_BY_TYPE_RESP: ' + request.toString('hex'));
      break;      
    case ATT_OP_READ_BY_GROUP_RESP:
      debug('ATT_OP_READ_BY_GROUP_RESP: ' + request.toString('hex'));
      break;
    case ATT_OP_HANDLE_NOTIFY:
    case ATT_OP_HANDLE_IND:
      debug('ATT_OP_HANDLE_NOTIFY: ' + request.toString('hex'));
      var valueHandle = data.readUInt16LE(1);
      var valueData = data.slice(3);

      this.emit('handleNotify', this._address, valueHandle, valueData);
      if (data[0] === ATT_OP_HANDLE_IND) {
        this._queueCommand(this.handleConfirmation(), null, function() {
          this.emit('handleConfirmation', this._address, valueHandle);
        }.bind(this));
      }

      for (var serviceUuid in this._services) {
        for (var characteristicUuid in this._characteristics[serviceUuid]) {
          if (this._characteristics[serviceUuid][characteristicUuid].valueHandle === valueHandle) {
            this.emit('notification', this._address, serviceUuid, characteristicUuid, valueData);
          }
        }
      }
      break;

    default:
    case ATT_OP_READ_MULTI_REQ:
    case ATT_OP_PREP_WRITE_REQ:
    case ATT_OP_EXEC_WRITE_REQ:
    case ATT_OP_SIGNED_WRITE_CMD:
      //response = this.errorResponse(requestType, 0x0000, ATT_ECODE_REQ_NOT_SUPP);
      break;


  }

  if (response) {
    debug('response: ' + response.toString('hex'));

    this.writeAtt(response);
  }


  if (this._currentCommand && data.toString('hex') === this._currentCommand.buffer.toString('hex')) {
    debug(this._address + ': echo ... echo ... echo ...');
  } else if (data[0] % 2 === 0) {
    var requestType = data[0];
     debug(this._address + ': replying with REQ_NOT_SUPP to 0x' + requestType.toString(16));
     this.writeAtt(this.errorResponse(requestType, 0x0000, ATT_ECODE_REQ_NOT_SUPP));
  } else if (!this._currentCommand) {
    debug(this._address + ': uh oh, no current command');
  } else {
    debug(this._address + ': There is a current command');

    if (data[0] === ATT_OP_ERROR &&
        (data[4] === ATT_ECODE_AUTHENTICATION || data[4] === ATT_ECODE_AUTHORIZATION || data[4] === ATT_ECODE_INSUFF_ENC) &&
        this._security !== 'medium') {

      debug('\t!! Need to encrypt!');
      this._aclStream.encrypt();
      return;
    }

    this._currentCommand.callback(data);

    this._currentCommand = null;

    while(this._commandQueue.length) {
      this._currentCommand = this._commandQueue.shift();
      debug('\tUnqueueing and sending command');
      this.writeAtt(this._currentCommand.buffer);

      if (this._currentCommand.callback) {
        break;
      } else if (this._currentCommand.writeCallback) {
        this._currentCommand.writeCallback();

        this._currentCommand = null;
      }
    }
  }
};

Gatt.prototype.onAclStreamEncrypt = function(encrypt) {
  if (encrypt) {
    this._security = 'medium';
    debug("Trying to Encrypt");
    //this.writeAtt(this._currentCommand.buffer);
  }
};

Gatt.prototype.onAclStreamEncryptFail = function(aclStream) {
  debug("onAclStreamEncryptFail: "+ aclStream);
  this._security = 'low';
this.emit('encryptFail',aclStream);
};


Gatt.prototype.onAclStreamEnd = function() {
  this._aclStream.removeListener('data', this.onAclStreamDataBinded);
  this._aclStream.removeListener('encrypt', this.onAclStreamEncryptBinded);
  this._aclStream.removeListener('encryptFail', this.onAclStreamEncryptFailBinded);
  this._aclStream.removeListener('end', this.onAclStreamEndBinded);
};

Gatt.prototype.errorResponse = function(opcode, handle, status) {
  var buf = new Buffer(5);

  debug('\tSending ATT_OP_ERROR');
  debug('\t\topcode: 0x' + opcode.toString(16));
  debug('\t\thandle 0x' + handle.toString(16));
  debug('\t\tstatus: 0x' + status.toString(16));
  buf.writeUInt8(ATT_OP_ERROR, 0);
  buf.writeUInt8(opcode, 1);
  buf.writeUInt16LE(handle, 2);
  buf.writeUInt8(status, 4);

  return buf;
};

Gatt.prototype.writeAtt = function(data) {
  debug(this._address + ': write: ' + data.toString('hex'));

  this._aclStream.write(ATT_CID, data);
};

Gatt.prototype._queueCommand = function(buffer, callback, writeCallback) {
  this._commandQueue.push({
    buffer: buffer,
    callback: callback,
    writeCallback: writeCallback
  });

  debug(this._commandQueue.length + ' Commands in Queue');

  if (this._currentCommand === null) {
    while (this._commandQueue.length) {
      this._currentCommand = this._commandQueue.shift();

      this.writeAtt(this._currentCommand.buffer);

      if (this._currentCommand.callback) {
        break;
      } else if (this._currentCommand.writeCallback) {
        this._currentCommand.writeCallback();

        this._currentCommand = null;
      }
    }
  }
};

Gatt.prototype.mtuRequest = function(mtu) {
  var buf = new Buffer(3);

  debug("Sending ATT_OP_MTU_REQ: " + mtu);
  buf.writeUInt8(ATT_OP_MTU_REQ, 0);
  buf.writeUInt16LE(mtu, 1);

  return buf;
};

Gatt.prototype.readByGroupRequest = function(startHandle, endHandle, groupUuid) {
  var buf = new Buffer(7);
  var printBuf = new Buffer(2);
  debug('\tSending ATT_OP_READ_BY_GROUP_REQ ID');
  debug('\t\tstartHandle: 0x' + startHandle.toString(16));
  debug('\t\tendHandle: 0x' + endHandle.toString(16));
  debug('\t\tgroupUuid: 0x' + groupUuid.toString(16));
  buf.writeUInt8(ATT_OP_READ_BY_GROUP_REQ, 0);
  buf.writeUInt16LE(startHandle, 1);
  buf.writeUInt16LE(endHandle, 3);
  buf.writeUInt16LE(groupUuid, 5);

  return buf;
};


/*
Gatt.prototype.readByTypeResponse = function(startHandle, endHandle, groupUuid) {
  var buf = new Buffer(7);

  buf.writeUInt8(ATT_OP_READ_BY_TYPE_REQ, 0);
  buf.writeUInt16LE(startHandle, 1);
  buf.writeUInt16LE(endHandle, 3);
  buf.writeUInt16LE(groupUuid, 5);

  return buf;
}*/

Gatt.prototype.readByTypeRequest = function(startHandle, endHandle, groupUuid) {
  var buf = new Buffer(7);

  debug('\tSending ATT_OP_READ_BY_TYPE_REQ');
  debug('\t\tstartHandle: 0x' + startHandle.toString(16));
  debug('\t\tendHandle: 0x' + endHandle.toString(16));
  debug('\t\tgroupUuid: 0x' + groupUuid.toString(16));

  buf.writeUInt8(ATT_OP_READ_BY_TYPE_REQ, 0);
  buf.writeUInt16LE(startHandle, 1);
  buf.writeUInt16LE(endHandle, 3);
  buf.writeUInt16LE(groupUuid, 5);

  return buf;
};

Gatt.prototype.readRequest = function(handle) {
  var buf = new Buffer(3);

  debug('\tSending ATT_OP_READ_REQ');
  debug('\t\thandle: 0x' + handle.toString(16));
  buf.writeUInt8(ATT_OP_READ_REQ, 0);
  buf.writeUInt16LE(handle, 1);

  return buf;
};

Gatt.prototype.readBlobRequest = function(handle, offset) {
  var buf = new Buffer(5);

  debug('\tSending ATT_OP_READ_BLOB_REQ');
  debug('\t\thandle: 0x' + handle.toString(16));
  debug('\t\toffset: 0x' + offset.toString(16));
  buf.writeUInt8(ATT_OP_READ_BLOB_REQ, 0);
  buf.writeUInt16LE(handle, 1);
  buf.writeUInt16LE(offset, 3);

  return buf;
};

Gatt.prototype.findInfoRequest = function(startHandle, endHandle) {
  var buf = new Buffer(5);

  debug('\tSending ATT_OP_FIND_INFO_REQ');
  debug('\t\tstartHandle: 0x' + startHandle.toString(16));
  debug('\t\tendHandle: 0x' + endHandle.toString(16));

  buf.writeUInt8(ATT_OP_FIND_INFO_REQ, 0);
  buf.writeUInt16LE(startHandle, 1);
  buf.writeUInt16LE(endHandle, 3);

  return buf;
};

Gatt.prototype.findByTypeRequest = function(startHandle, endHandle, uuid, value) {
  var buf = new Buffer(7 + value.length);

  debug('\tSending ATT_OP_READ_BY_TYPE_REQ');
  debug('\t\tstartHandle: 0x' + startHandle.toString(16));
  debug('\t\tendHandle: 0x' + endHandle.toString(16));
  debug('\t\tuuid: 0x' + uuid.toString(16));
  buf.writeUInt8(ATT_OP_FIND_BY_TYPE_REQ , 0);
  buf.writeUInt16LE(startHandle, 1);
  buf.writeUInt16LE(endHandle, 3);
  buf.writeUInt16LE(uuid, 5);

  for (var i = 0; i < value.length; i++) {
    buf.writeUInt8(value.readUInt8(i), (value.length - i - 1) + 7);
  }

  var callback = function(data) {
    var opcode = data[0];
    var i = 0;

    debug("\tATT_OP_FIND_BY_TYPE_RESP Callback");

    if (opcode === ATT_OP_FIND_BY_TYPE_RESP) {

      var serviceUuids = [];
      var services = [];
      var start = data.readUInt16LE(1);
      var end = data.readUInt16LE(3);
          services.push({
            startHandle: start,
            endHandle: end,
            uuid: uuid
          });

        serviceUuids.push(uuid);

        this._services[services[0].uuid] = services[0];
      
      debug('\tATT_OP_FIND_BY_TYPE_RESP Found Service UUID: 0x' + uuid.toString(16) + " start-  0x" + start.toString(16) + " end - 0x" + end.toString(16));
      this.emit('servicesDiscover', this._address, serviceUuids);

      //this.emit('descriptorsDiscover', this._address, start, end);
 
    }

  }.bind(this);


  this._queueCommand(buf, callback );
 
  return buf;
};


Gatt.prototype.writeRequest = function(handle, data, withoutResponse) {
  var buf = new Buffer(3 + data.length);

  if (withoutResponse) {
  debug('\tSending ATT_OP_WRITE_CMD');
  } else
  {
  debug('\tSending ATT_OP_WRITE_REQ');    
  }
  debug('\t\thandle: 0x' + handle.toString(16));


  buf.writeUInt8(withoutResponse ? ATT_OP_WRITE_CMD : ATT_OP_WRITE_REQ , 0);
  buf.writeUInt16LE(handle, 1);

  for (var i = 0; i < data.length; i++) {
    buf.writeUInt8(data.readUInt8(i), i + 3);
  }

  return buf;
};


Gatt.prototype.handleOpError = function(data) {
      var opcode = data[0];
      if (opcode === ATT_OP_ERROR) {
        var errOpCode = data[1];
        
      switch(errOpCode) {
        case ATT_OP_ERROR:
          debug('\tOpCode in Error: ATT_OP_ERROR: ');
          break;
        case ATT_OP_READ_BY_TYPE_RESP:
          debug('\tOpCode in Error: ATT_OP_READ_BY_TYPE_RESP: ');
          break;      
        case ATT_OP_READ_BY_GROUP_RESP:
          debug('\tOpCode in Error: ATT_OP_READ_BY_GROUP_RESP: ');
          break;
        case ATT_OP_MTU_REQ:
          debug('\tOpCode in Error: ATT_OP_MTU_REQ: ');
          break;
        case ATT_OP_MTU_RESP:
          debug("\tOpCode in Error: ATT_OP_MTU_RESP");
        break;
        case ATT_OP_FIND_INFO_REQ:
          debug('\tOpCode in Error: ATT_OP_FIND_INFO_REQ: ');
          break;
        case ATT_OP_FIND_BY_TYPE_REQ:
          debug('\tOpCode in Error: ATT_OP_FIND_BY_TYPE_REQ: ');
          break;
        case ATT_OP_READ_BY_TYPE_REQ:
          debug('\tOpCode in Error: ATT_OP_READ_BY_TYPE_REQ:');
          break;
        case ATT_OP_READ_REQ:
        case ATT_OP_READ_BLOB_REQ:
          debug('\tOpCode in Error: ATT_OP_READ_REQ: ');
          break;
        case ATT_OP_READ_BY_GROUP_REQ:
          debug('\tOpCode in Error: ATT_OP_READ_BY_GROUP_REQ: ');
          break;
        case ATT_OP_WRITE_REQ:
        case ATT_OP_WRITE_CMD:
          debug('\tOpCode in Error: ATT_OP_WRITE_REQ: ');
          break;
        case ATT_OP_HANDLE_CNF:
          debug('\tOpCode in Error: ATT_OP_HANDLE_CNF: ');
          break;
        case ATT_OP_HANDLE_NOTIFY:
        case ATT_OP_HANDLE_IND:
          debug('\tOpCode in Error: ATT_OP_HANDLE_NOTIFY: ');
          break;
        default:
          debug("\tOpCode in Error: " + errOpCode)
      }
      debug('\tHandle: 0x' + data.readUInt16LE(2).toString(16));
      var errorCode = data[4];
      debug('\tError Code: 0x'+errorCode.toString(16));
      switch(errorCode) {
        case ATT_ECODE_SUCCESS:
          debug('\tError Code: ATT_ECODE_SUCCESS: ');
          break;
        case ATT_ECODE_INVALID_HANDLE:
          debug('\tError Code: ATT_ECODE_INVALID_HANDLE: ');
          break;
        case ATT_ECODE_READ_NOT_PERM:
          debug('\tError Code: ATT_ECODE_READ_NOT_PERM: ');
          break;
        case ATT_ECODE_WRITE_NOT_PERM:
          debug('\tError Code: ATT_ECODE_WRITE_NOT_PERM: ');
          break;
        case ATT_ECODE_INVALID_PDU:
          debug('\tError Code: ATT_ECODE_INVALID_PDU: ');
          break;
        case ATT_ECODE_AUTHENTICATION:
          debug('\tError Code: ATT_ECODE_AUTHENTICATION: ');
          break;
        case ATT_ECODE_REQ_NOT_SUPP:
          debug('\tError Code: ATT_ECODE_REQ_NOT_SUPP: ');
          break;
        case ATT_ECODE_INVALID_OFFSET:
          debug('\tError Code: ATT_ECODE_INVALID_OFFSET: ');
          break;
        case ATT_ECODE_AUTHORIZATION:
          debug('\tError Code: ATT_ECODE_AUTHORIZATION: ');
          break;
        case ATT_ECODE_PREP_QUEUE_FULL:
          debug('\tError Code: ATT_ECODE_PREP_QUEUE_FULL: ');
          break;
        case ATT_ECODE_ATTR_NOT_FOUND:
          debug('\tError Code: ATT_ECODE_ATTR_NOT_FOUND: ');
          break;
        case ATT_ECODE_ATTR_NOT_LONG:
          debug('\tError Code: ATT_ECODE_ATTR_NOT_LONG: ');
          break;
        case ATT_ECODE_INSUFF_ENCR_KEY_SIZE:
          debug('\tError Code: ATT_ECODE_INSUFF_ENCR_KEY_SIZE: ');
          break;
        case ATT_ECODE_INVAL_ATTR_VALUE_LEN:
          debug('\tError Code: ATT_ECODE_INVAL_ATTR_VALUE_LEN: ');
          break;
        case ATT_ECODE_UNLIKELY:
          debug('\tError Code: ATT_ECODE_UNLIKELY: ');
          break;
        case ATT_ECODE_INSUFF_ENC:
          debug('\tError Code: ATT_ECODE_INSUFF_ENC: ');
          break;
        case ATT_ECODE_UNSUPP_GRP_TYPE:
          debug('\tError Code: ATT_ECODE_UNSUPP_GRP_TYPE: ');
          break;
        case ATT_ECODE_INSUFF_RESOURCES:
          debug('\tError Code: ATT_ECODE_INSUFF_RESOURCES: ');
          break;
        default:
          debug('\tError Code: ' + errorCode);
          break;
      }
    }
};

Gatt.prototype.handleConfirmation = function(request) {
  if (this._lastIndicatedAttribute) {
    if (this._lastIndicatedAttribute.emit) {
      this._lastIndicatedAttribute.emit('indicate');
    }

    this._lastIndicatedAttribute = null;
  }
};


Gatt.prototype.exchangeMtu = function(mtu) {
  this._queueCommand(this.mtuRequest(mtu), function(data) {
    var opcode = data[0];

    if (opcode === ATT_OP_MTU_RESP) {
      var newMtu = data.readUInt16LE(1);
      debug("Echange Mtu: " + newMtu)
      debug(this._address + ': new MTU is ' + newMtu);

      this._mtu = newMtu;

      this.emit('mtu', this._address, newMtu);
    } else {
      this.emit('mtu', this._address, 23);
    }
  }.bind(this));
};

Gatt.prototype.discoverServices = function(uuids) {
  var services = [];

  debug("Discover Services: " + uuids);
  var callback = function(data) {
    var opcode = data[0];
    var i = 0;

    if (opcode === ATT_OP_READ_BY_GROUP_RESP) {
      var type = data[1];
      var num = (data.length - 2) / type;

      debug("ATT_OP_READ_BY_GROUP_RESP: ");
      for (i = 0; i < num; i++) {
        debug("\tService - Start: " + data.readUInt16LE(2 + i * type + 0) + " End: " + data.readUInt16LE(2 + i * type + 2) + " UUID: " + (type == 6) ? data.readUInt16LE(2 + i * type + 4).toString(16) : data.slice(2 + i * type + 4).slice(0, 16).toString('hex').match(/.{1,2}/g).reverse().join(''));
        services.push({
          startHandle: data.readUInt16LE(2 + i * type + 0),
          endHandle: data.readUInt16LE(2 + i * type + 2),
          uuid: (type == 6) ? data.readUInt16LE(2 + i * type + 4).toString(16) : data.slice(2 + i * type + 4).slice(0, 16).toString('hex').match(/.{1,2}/g).reverse().join('')
        });
      }
    }

    if (opcode !== ATT_OP_READ_BY_GROUP_RESP || services[services.length - 1].endHandle === 0xffff) {

      var serviceUuids = [];
      for (i = 0; i < services.length; i++) {
        if (uuids.length === 0 || uuids.indexOf(services[i].uuid) !== -1) {
          serviceUuids.push(services[i].uuid);
        }

        this._services[services[i].uuid] = services[i];
      }
      this.emit('servicesDiscover', this._address, serviceUuids);
    } else {
      this._queueCommand(this.readByGroupRequest(services[services.length - 1].endHandle + 1, 0xffff, GATT_PRIM_SVC_UUID), callback);
    }
  }.bind(this);

  this._queueCommand(this.readByGroupRequest(0x0001, 0xffff, GATT_PRIM_SVC_UUID), callback);
};

Gatt.prototype.discoverIncludedServices = function(serviceUuid, uuids) {
  var service = this._services[serviceUuid];
  var includedServices = [];

  var callback = function(data) {
    var opcode = data[0];
    var i = 0;

    if (opcode === ATT_OP_READ_BY_TYPE_RESP) {
      var type = data[1];
      var num = (data.length - 2) / type;

      for (i = 0; i < num; i++) {
        includedServices.push({
          endHandle: data.readUInt16LE(2 + i * type + 0),
          startHandle: data.readUInt16LE(2 + i * type + 2),
          uuid: (type == 8) ? data.readUInt16LE(2 + i * type + 6).toString(16) : data.slice(2 + i * type + 6).slice(0, 16).toString('hex').match(/.{1,2}/g).reverse().join('')
        });
      }
    }

    if (opcode !== ATT_OP_READ_BY_TYPE_RESP || includedServices[includedServices.length - 1].endHandle === service.endHandle) {
      var includedServiceUuids = [];

      for (i = 0; i < includedServices.length; i++) {
        if (uuids.length === 0 || uuids.indexOf(includedServices[i].uuid) !== -1) {
          includedServiceUuids.push(includedServices[i].uuid);
        }
      }

      this.emit('includedServicesDiscover', this._address, service.uuid, includedServiceUuids);
    } else {
      this._queueCommand(this.readByTypeRequest(includedServices[includedServices.length - 1].endHandle + 1, service.endHandle, GATT_INCLUDE_UUID), callback);
    }
  }.bind(this);

  this._queueCommand(this.readByTypeRequest(service.startHandle, service.endHandle, GATT_INCLUDE_UUID), callback);
};

Gatt.prototype.discoverCharacteristics = function(serviceUuid, characteristicUuids) {
  var service = this._services[serviceUuid];
  var characteristics = [];

  this._characteristics[serviceUuid] = {};
  this._descriptors[serviceUuid] = {};
  debug('Discovering Characteristics for Service: ' + serviceUuid.toString(16));

  var callback = function(data) {
    var opcode = data[0];
    var i = 0;

    debug("Recieved response for Read By Type Resp");
    if (opcode === ATT_OP_READ_BY_TYPE_RESP) {
      debug('\tATT_OP_READ_BY_TYPE_RESP: 0x' + opcode.toString(16));
      var type = data[1];
      var num = (data.length - 2) / type;

      for (i = 0; i < num; i++) {
        characteristics.push({
          startHandle: data.readUInt16LE(2 + i * type + 0),
          properties: data.readUInt8(2 + i * type + 2),
          valueHandle: data.readUInt16LE(2 + i * type + 3),
          uuid: (type == 7) ? data.readUInt16LE(2 + i * type + 5).toString(16) : data.slice(2 + i * type + 5).slice(0, 16).toString('hex').match(/.{1,2}/g).reverse().join('')
        });
        debug('\tuuid: 0x' + characteristics[characteristics.length - 1].uuid);
        debug('\t\tstartHandle: 0x' + data.readUInt16LE(2 + i * type + 0).toString(16));
        debug('\t\tproperties: 0x' + data.readUInt8(2 + i * type + 2));
        debug('\t\tvalueHandle: 0x' + data.readUInt16LE(2 + i * type + 3));
        
      }
    }

    if (opcode !== ATT_OP_READ_BY_TYPE_RESP || characteristics[characteristics.length - 1].valueHandle === service.endHandle) {
      debug('\tNot ATT_OP_READ_BY_TYPE_RESP: 0x' + opcode.toString(16));
      var characteristicsDiscovered = [];
      for (i = 0; i < characteristics.length; i++) {
        var properties = characteristics[i].properties;

        var characteristic = {
          properties: [],
          uuid: characteristics[i].uuid
        };

        if (i !== 0) {
          characteristics[i - 1].endHandle = characteristics[i].startHandle - 1;
        }

        if (i === (characteristics.length - 1)) {
          characteristics[i].endHandle = service.endHandle;
        }

        this._characteristics[serviceUuid][characteristics[i].uuid] = characteristics[i];

        if (properties & 0x01) {
          characteristic.properties.push('broadcast');
        }

        if (properties & 0x02) {
          characteristic.properties.push('read');
        }

        if (properties & 0x04) {
          characteristic.properties.push('writeWithoutResponse');
        }

        if (properties & 0x08) {
          characteristic.properties.push('write');
        }

        if (properties & 0x10) {
          characteristic.properties.push('notify');
        }

        if (properties & 0x20) {
          characteristic.properties.push('indicate');
        }

        if (properties & 0x40) {
          characteristic.properties.push('authenticatedSignedWrites');
        }

        if (properties & 0x80) {
          characteristic.properties.push('extendedProperties');
        }

        if (characteristicUuids.length === 0 || characteristicUuids.indexOf(characteristic.uuid) !== -1) {
          characteristicsDiscovered.push(characteristic);
        }
      }

      this.emit('characteristicsDiscover', this._address, serviceUuid, characteristicsDiscovered);
    } else {
      this._queueCommand(this.readByTypeRequest(characteristics[characteristics.length - 1].valueHandle + 1, service.endHandle, GATT_CHARAC_UUID), callback);
    }
  }.bind(this);

  this._queueCommand(this.readByTypeRequest(service.startHandle, service.endHandle, GATT_CHARAC_UUID), callback);
};

Gatt.prototype.read = function(serviceUuid, characteristicUuid) {
  var characteristic = this._characteristics[serviceUuid][characteristicUuid];

  var readData = new Buffer(0);

  var callback = function(data) {
    var opcode = data[0];

    if (opcode === ATT_OP_READ_RESP || opcode === ATT_OP_READ_BLOB_RESP) {
      readData = new Buffer(readData.toString('hex') + data.slice(1).toString('hex'), 'hex');

      if (data.length === this._mtu) {
        this._queueCommand(this.readBlobRequest(characteristic.valueHandle, readData.length), callback);
      } else {
        this.emit('read', this._address, serviceUuid, characteristicUuid, readData);
      }
    } else {
      this.emit('read', this._address, serviceUuid, characteristicUuid, readData);
    }
  }.bind(this);

  this._queueCommand(this.readRequest(characteristic.valueHandle), callback);
};

Gatt.prototype.write = function(serviceUuid, characteristicUuid, data, withoutResponse) {
  var characteristic = this._characteristics[serviceUuid][characteristicUuid];

  if (withoutResponse) {
    this._queueCommand(this.writeRequest(characteristic.valueHandle, data, true), null, function() {
      this.emit('write', this._address, serviceUuid, characteristicUuid);
    }.bind(this));
  } else {
    this._queueCommand(this.writeRequest(characteristic.valueHandle, data, false), function(data) {
      var opcode = data[0];

      if (opcode === ATT_OP_WRITE_RESP) {
        this.emit('write', this._address, serviceUuid, characteristicUuid);
      }
    }.bind(this));
  }
};

Gatt.prototype.broadcast = function(serviceUuid, characteristicUuid, broadcast) {
  var characteristic = this._characteristics[serviceUuid][characteristicUuid];

  this._queueCommand(this.readByTypeRequest(characteristic.startHandle, characteristic.endHandle, GATT_SERVER_CHARAC_CFG_UUID), function(data) {
    var opcode = data[0];
    if (opcode === ATT_OP_READ_BY_TYPE_RESP) {
      var type = data[1];
      var handle = data.readUInt16LE(2);
      var value = data.readUInt16LE(4);

      if (broadcast) {
        value |= 0x0001;
      } else {
        value &= 0xfffe;
      }

      var valueBuffer = new Buffer(2);
      valueBuffer.writeUInt16LE(value, 0);

      this._queueCommand(this.writeRequest(handle, valueBuffer, false), function(data) {
        var opcode = data[0];

        if (opcode === ATT_OP_WRITE_RESP) {
          this.emit('broadcast', this._address, serviceUuid, characteristicUuid, broadcast);
        }
      }.bind(this));
    }
  }.bind(this));
};

Gatt.prototype.notify = function(serviceUuid, characteristicUuid, notify) {
  var characteristic = this._characteristics[serviceUuid][characteristicUuid];

  this._queueCommand(this.readByTypeRequest(characteristic.startHandle, characteristic.endHandle, GATT_CLIENT_CHARAC_CFG_UUID), function(data) {
    var opcode = data[0];
    if (opcode === ATT_OP_READ_BY_TYPE_RESP) {
      var type = data[1];
      var handle = data.readUInt16LE(2);
      var value = data.readUInt16LE(4);

      var useNotify = characteristic.properties & 0x10;
      var useIndicate = characteristic.properties & 0x20;

      if (notify) {
        if (useNotify) {
          value |= 0x0001;
        } else if (useIndicate) {
          value |= 0x0002;
        }
      } else {
        if (useNotify) {
          value &= 0xfffe;
        } else if (useIndicate) {
          value &= 0xfffd;
        }
      }

      var valueBuffer = new Buffer(2);
      valueBuffer.writeUInt16LE(value, 0);

      this._queueCommand(this.writeRequest(handle, valueBuffer, false), function(data) {
        var opcode = data[0];

        if (opcode === ATT_OP_WRITE_RESP) {
          this.emit('notify', this._address, serviceUuid, characteristicUuid, notify);
        }
      }.bind(this));
    }
  }.bind(this));
};

Gatt.prototype.discoverDescriptors = function(serviceUuid, characteristicUuid) {
  var characteristic = this._characteristics[serviceUuid][characteristicUuid];
  var descriptors = [];

  this._descriptors[serviceUuid][characteristicUuid] = {};

  var callback = function(data) {
    var opcode = data[0];
    var i = 0;

    if (opcode === ATT_OP_FIND_INFO_RESP) {
      var num = data[1];

      for (i = 0; i < num; i++) {
        descriptors.push({
          handle: data.readUInt16LE(2 + i * 4 + 0),
          uuid: data.readUInt16LE(2 + i * 4 + 2).toString(16)
        });
      }
    }

    if (opcode !== ATT_OP_FIND_INFO_RESP || descriptors[descriptors.length - 1].handle === characteristic.endHandle) {
      var descriptorUuids = [];
      for (i = 0; i < descriptors.length; i++) {
        descriptorUuids.push(descriptors[i].uuid);

        this._descriptors[serviceUuid][characteristicUuid][descriptors[i].uuid] = descriptors[i];
      }

      this.emit('descriptorsDiscover', this._address, serviceUuid, characteristicUuid, descriptorUuids);
    } else {
      this._queueCommand(this.findInfoRequest(descriptors[descriptors.length - 1].handle + 1, characteristic.endHandle), callback);
    }
  }.bind(this);

  this._queueCommand(this.findInfoRequest(characteristic.valueHandle + 1, characteristic.endHandle), callback);
};

Gatt.prototype.readValue = function(serviceUuid, characteristicUuid, descriptorUuid) {
  var descriptor = this._descriptors[serviceUuid][characteristicUuid][descriptorUuid];

  this._queueCommand(this.readRequest(descriptor.handle), function(data) {
    var opcode = data[0];

    if (opcode === ATT_OP_READ_RESP) {
      this.emit('valueRead', this._address, serviceUuid, characteristicUuid, descriptorUuid, data.slice(1));
    }
  }.bind(this));
};

Gatt.prototype.writeValue = function(serviceUuid, characteristicUuid, descriptorUuid, data) {
  var descriptor = this._descriptors[serviceUuid][characteristicUuid][descriptorUuid];

  this._queueCommand(this.writeRequest(descriptor.handle, data, false), function(data) {
    var opcode = data[0];

    if (opcode === ATT_OP_WRITE_RESP) {
      this.emit('valueWrite', this._address, serviceUuid, characteristicUuid, descriptorUuid);
    }
  }.bind(this));
};

Gatt.prototype.readHandle = function(handle) {
  this._queueCommand(this.readRequest(handle), function(data) {
    var opcode = data[0];

    if (opcode === ATT_OP_READ_RESP) {
      this.emit('handleRead', this._address, handle, data.slice(1));
    }
  }.bind(this));
};

Gatt.prototype.writeHandle = function(handle, data, withoutResponse) {
  if (withoutResponse) {
    this._queueCommand(this.writeRequest(handle, data, true), null, function() {
      this.emit('handleWrite', this._address, handle);
    }.bind(this));
  } else {
    this._queueCommand(this.writeRequest(handle, data, false), function(data) {
      var opcode = data[0];

      if (opcode === ATT_OP_WRITE_RESP) {
        this.emit('handleWrite', this._address, handle);
      }
    }.bind(this));
  }
};

module.exports = Gatt;
