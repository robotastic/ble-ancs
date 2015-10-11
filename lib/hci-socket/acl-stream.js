var debug = require('debug')('acl-att-stream');

var events = require('events');
var util = require('util');

var crypto = require('./crypto');
var Smp = require('./smp');

var AclStream = function(hci, handle, localAddressType, localAddress, remoteAddressType, remoteAddress) {
  this._hci = hci;
  this._handle = handle;
  this.encypted = false;

  this._smp = new Smp(this, localAddressType, localAddress, remoteAddressType, remoteAddress);

  this.onSmpStkBinded = this.onSmpStk.bind(this);
  this.onSmpFailBinded = this.onSmpFail.bind(this);
  this.onSmpEndBinded = this.onSmpEnd.bind(this);

  this._smp.on('stk', this.onSmpStkBinded);
  this._smp.on('fail', this.onSmpFailBinded);
  this._smp.on('end', this.onSmpEndBinded);
};

util.inherits(AclStream, events.EventEmitter);

AclStream.prototype.encrypt = function() {
  this._smp.sendPairingRequest();
};

AclStream.prototype.pushLtkNegReply = function() {
  this.emit('ltkNegReply');
};

AclStream.prototype.write = function(cid, data) {
  this._hci.writeAclDataPkt(this._handle, cid, data);
};

AclStream.prototype.push = function(cid, data) {
  if (data) {
    this.emit('data', cid, data);
  } else {
    this.emit('end');
  }
};

AclStream.prototype.pushEncrypt = function(encrypt) {

  this.encrypted = encrypt ? true : false;

  //bleno
  this.emit('encryptChange', this.encrypted);
  
  //noble
  this.emit('encrypt', encrypt);
};

AclStream.prototype.onSmpStk = function(stk) {
  var random = new Buffer('0000000000000000', 'hex');
  var diversifier = new Buffer('0000', 'hex');

  this._hci.startLeEncryption(this._handle, random, diversifier, stk);
};

AclStream.prototype.onSmpFail = function() {
  this.emit('encryptFail', this);

};

AclStream.prototype.onSmpEnd = function() {
  this._smp.removeListener('stk', this.onSmpStkBinded);
  this._smp.removeListener('fail', this.onSmpFailBinded);
  this._smp.removeListener('end', this.onSmpEndBinded);
};

module.exports = AclStream;
