var debug = require('debug')('smp');

var events = require('events');
var util = require('util');

var crypto = require('./crypto');


var SMP_CID = 0x0006;

var SMP_PAIRING_REQUEST = 0x01;
var SMP_PAIRING_RESPONSE = 0x02;
var SMP_PAIRING_CONFIRM = 0x03;
var SMP_PAIRING_RANDOM = 0x04;
var SMP_PAIRING_FAILED = 0x05;
var SMP_ENCRYPT_INFO = 0x06;
var SMP_MASTER_IDENT = 0x07;


var LTK_INFO_SIZE = 36;

var MGMT_OP_LOAD_LONG_TERM_KEYS = 0x0013;

var Smp = function(aclStream, localAddressType, localAddress, remoteAddressType, remoteAddress) {
  this._aclStream = aclStream;
    this._ltkInfos = [];

//Bleno
  this._iat = new Buffer([(remoteAddressType === 'random') ? 0x01 : 0x00]);
  this._ia = new Buffer(remoteAddress.split(':').reverse().join(''), 'hex');
  this._rat = new Buffer([(localAddressType === 'random') ? 0x01 : 0x00]);
  this._ra = new Buffer(localAddress.split(':').reverse().join(''), 'hex');

/*
    //Noble
  this._iat = new Buffer([(localAddressType === 'random') ? 0x01 : 0x00]);
  this._ia = new Buffer(localAddress.split(':').reverse().join(''), 'hex');
  this._rat = new Buffer([(remoteAddressType === 'random') ? 0x01 : 0x00]);
  this._ra = new Buffer(remoteAddress.split(':').reverse().join(''), 'hex');
  */

  this.onAclStreamDataBinded = this.onAclStreamData.bind(this);
  this.onAclStreamEncryptChangeBinded = this.onAclStreamEncryptChange.bind(this);
  this.onAclStreamLtkNegReplyBinded = this.onAclStreamLtkNegReply.bind(this);
  this.onAclStreamEndBinded = this.onAclStreamEnd.bind(this);

  this._aclStream.on('data', this.onAclStreamDataBinded);
  this._aclStream.on('encryptChange', this.onAclStreamEncryptChangeBinded);
  this._aclStream.on('ltkNegReply', this.onAclStreamLtkNegReplyBinded);
  this._aclStream.on('end', this.onAclStreamEndBinded);
};

util.inherits(Smp, events.EventEmitter);





Smp.prototype.sendPairingRequest = function() {
  console.log("Sending pairing request");
  this._preq = new Buffer([
    SMP_PAIRING_REQUEST,
    0x03, //0x04, // IO capability: NoInputNoOutput
    0x00, // OOB data: Authentication data not present
    0x01, //0x05, // Authentication requirement: Bonding - No MITM
    0x10, // Max encryption key size
    0x00, //0x03, // Initiator key distribution: <none>
    0x01  //0x03  // Responder key distribution: EncKey
  ]);

  this.write(this._preq);
};


Smp.prototype.handlePairingRequest = function(data) {
  this._preq = data;
  console.log("Recieved a Pairing Request");
  this._pres = new Buffer([
    SMP_PAIRING_RESPONSE,
    0x03, // IO capability: NoInputNoOutput
    0x00, // OOB data: Authentication data not present
    0x05, //0x01, // Authentication requirement: Bonding - No MITM
    0x10, // Max encryption key size
    0x03, //0x00, // Initiator key distribution: <none>
    0x01  //0x01  // Responder key distribution: EncKey
  ]);
  debug('\tShould be Sending: ' + this._pres.toString('hex'));

    //here
    this.write(this._pres);
};


/*
Smp.prototype.handlePairingRequest = function(data) {
  this._preq = data;
  console.log("Recieved a Pairing Request");
  this._pres = new Buffer([
    SMP_PAIRING_RESPONSE,
    0x03, // IO capability: NoInputNoOutput
    0x00, // OOB data: Authentication data not present
    0x01, // Authentication requirement: Bonding - No MITM
    0x10, // Max encryption key size
    0x00, // Initiator key distribution: <none>
    0x01  // Responder key distribution: EncKey
  ]);

  this.write(this._pres);
};
*/

Smp.prototype.onAclStreamLtkNegReply = function() {
    debug("SMP recieved LtkNegReply - Means Pairing failed...");
    this.write(new Buffer([
      SMP_PAIRING_FAILED,
      SMP_UNSPECIFIED
    ]));

    this.emit('fail');
};

Smp.prototype.onAclStreamData = function(cid, data) {
  if (cid !== SMP_CID) {
    return;
  }

  var code = data.readUInt8(0);
  debug("SMP Data - code: 0x" + code.toString(16));
  if (SMP_PAIRING_REQUEST === code) {
      debug("SMP_PAIRING_REQUEST");
    this.handlePairingRequest(data);
  } else if (SMP_PAIRING_RESPONSE === code) {
      debug("SMP_PAIRING_RESPONSE");
    this.handlePairingResponse(data);
  } else if (SMP_PAIRING_CONFIRM === code) {
      debug("SMP_PAIRING_CONFIRM");
    this.handlePairingConfirm(data);
  } else if (SMP_PAIRING_RANDOM === code) {
      debug("SMP_PAIRING_RANDOM");
    this.handlePairingRandom(data);
  } else if (SMP_PAIRING_FAILED === code) {
      debug("SMP_PAIRING_FAILED");
    this.handlePairingFailed(data);
  } else if (SMP_ENCRYPT_INFO === code) {
      debug("SMP_ENCRYPT_INFO");
    this.handleEncryptInfo(data);
  } else if (SMP_MASTER_IDENT === code) {
      debug("SMP_MASTER_IDENT");
    this.handleMasterIdent(data);
  } else {
      debug("Unhandled SMP code!");
  }
};

Smp.prototype.onAclStreamEnd = function() {
  this._aclStream.removeListener('data', this.onAclStreamDataBinded);
  this._aclStream.removeListener('end', this.onAclStreamEndBinded);
  this._aclStream.removeListener('encryptChange', this.onAclStreamEncryptChangeBinded);
  this._aclStream.removeListener('ltkNegReply', this.onAclStreamLtkNegReplyBinded);

  this.emit('end');
};

Smp.prototype.onAclStreamEncryptChange = function(encrypted) {
  if (encrypted) {
    if (this._stk && this._diversifier && this._random) {
      this.write(Buffer.concat([
        new Buffer([SMP_ENCRYPT_INFO]),
        this._stk
      ]));

      this.write(Buffer.concat([
        new Buffer([SMP_MASTER_IDENT]),
        this._diversifier,
        this._random
      ]));
    }
  }
};

Smp.prototype.handlePairingResponse = function(data) {
  this._pres = data;
  debug("Recieved a Pairing Response");
  debug('\t\tIO Capability: 0x' + data[1].toString(16));
  debug('\t\tOOB Data: 0x' + data[2].toString(16));
  debug('\t\tAuthentication Requirement: 0x' + data[3].toString(16));
  debug('\t\tMax Encryption Size: 0x' + data[4].toString(16));
  debug('\t\tInitiator Key: 0x' + data[5].toString(16));
  debug('\t\tResponder Key: 0x' + data[6].toString(16));


  this._tk = new Buffer('00000000000000000000000000000000', 'hex');
  this._r = crypto.r();
  var output = Buffer.concat([
    new Buffer([SMP_PAIRING_CONFIRM]),
    crypto.c1(this._tk, this._r, this._pres, this._preq, this._iat, this._ia, this._rat, this._ra)
  ]);    
  debug('\tShould be Sending: ' + output.toString('hex'));    

  this.write(Buffer.concat([
    new Buffer([SMP_PAIRING_CONFIRM]),
    crypto.c1(this._tk, this._r, this._pres, this._preq, this._iat, this._ia, this._rat, this._ra)
  ]));
};



//Bleno

Smp.prototype.handlePairingConfirm = function(data) {
  this._pcnf = data;

  this._tk = new Buffer('00000000000000000000000000000000', 'hex');
  this._r = crypto.r();
  debug("Recieved a Pairing Confirm");

   var output = Buffer.concat([
    new Buffer([SMP_PAIRING_CONFIRM]),
    crypto.c1(this._tk, this._r, this._pres, this._preq, this._iat, this._ia, this._rat, this._ra)
  ]);
debug('\tShould be Sending: ' + output.toString('hex'));   
    //here
  this.write(Buffer.concat([
    new Buffer([SMP_PAIRING_CONFIRM]),
    crypto.c1(this._tk, this._r, this._pres, this._preq, this._iat, this._ia, this._rat, this._ra)
  ]));
};
/*

//Noble
Smp.prototype.handlePairingConfirm = function(data) {
  this._pcnf = data;

  this.write(Buffer.concat([
    new Buffer([SMP_PAIRING_RANDOM]),
    this._r
  ]));
};*/


//Bleno

Smp.prototype.addLongTermKey = function(address, addressType, authenticated, master, ediv, rand, key) {
  var ltkInfo = new Buffer(LTK_INFO_SIZE);

  address.copy(ltkInfo, 0);
  ltkInfo.writeUInt8(addressType.readUInt8(0) + 1, 6); // BDADDR_LE_PUBLIC = 0x01, BDADDR_LE_RANDOM 0x02, so add one

  ltkInfo.writeUInt8(authenticated, 7);
  ltkInfo.writeUInt8(master, 8);
  ltkInfo.writeUInt8(key.length, 9);

  ediv.copy(ltkInfo, 10);
  rand.copy(ltkInfo, 12);
  key.copy(ltkInfo, 20);

  this._ltkInfos.push(ltkInfo);

    debug("Add Long Term Key ediv: " + ediv + " rand: " + rand + " key: " + key);
  this.loadLongTermKeys();
};

Smp.prototype.clearLongTermKeys = function() {
  this._ltkInfos = [];

  this.loadLongTermKeys();
};

Smp.prototype.loadLongTermKeys = function() {
  var numLongTermKeys = this._ltkInfos.length;
  var op = new Buffer(2 + numLongTermKeys * LTK_INFO_SIZE);

  op.writeUInt16LE(numLongTermKeys, 0);

  debug("Load Long Term Keys")
  for (var i = 0; i < numLongTermKeys; i++) {
    debug('\t\t'+this._ltkInfos[i]);
    this._ltkInfos[i].copy(op, 2 + i * LTK_INFO_SIZE);
  }

  //not this this.write(MGMT_OP_LOAD_LONG_TERM_KEYS, 0, op);
 
    this.mgmtWrite(MGMT_OP_LOAD_LONG_TERM_KEYS, 0, op);
};

Smp.prototype.mgmtWrite = function(opcode, index, data) {
  var length = 0;

  if (data) {
    length = data.length;
  }

  var pkt = new Buffer(6 + length);

  pkt.writeUInt16LE(opcode, 0);
  pkt.writeUInt16LE(index, 2);
  pkt.writeUInt16LE(length, 4);

  if (length) {
    data.copy(pkt, 6);
  }

  debug('Mgmt writing -> ' + pkt.toString('hex'));
  this.write(pkt);
};


Smp.prototype.handlePairingRandom = function(data) {
  var r = data.slice(1);

  debug("Handle Pairing Random: ");

  var pcnf = Buffer.concat([
    new Buffer([SMP_PAIRING_CONFIRM]),
    crypto.c1(this._tk, r, this._pres, this._preq, this._iat, this._ia, this._rat, this._ra)
  ]);

  if (this._pcnf.toString('hex') === pcnf.toString('hex')) {
    debug('\t\tRandom Worked: ');
    this._diversifier = new Buffer('0000', 'hex');
    this._random = new Buffer('0000000000000000', 'hex');
    this._stk = crypto.s1(this._tk, this._r, r);

    this.addLongTermKey(this._ia, this._iat, 0, 0, this._diversifier, this._random, this._stk);

      var output = Buffer.concat([
      new Buffer([SMP_PAIRING_RANDOM]),
      this._r
    ]);
      debug('\tShould be Sending: ' + output.toString('hex'));  
      
      //here
    this.write(Buffer.concat([
      new Buffer([SMP_PAIRING_RANDOM]),
      this._r
    ]));
  } else {
    debug('\t\tRandom failed: ');
      here
    this.write(new Buffer([
      SMP_PAIRING_FAILED,
      SMP_PAIRING_CONFIRM
    ]));

    this.emit('fail');
  }

};

/*
//Noble
Smp.prototype.handlePairingRandom = function(data) {
  var r = data.slice(1);

  var pcnf = Buffer.concat([
    new Buffer([SMP_PAIRING_CONFIRM]),
    crypto.c1(this._tk, r, this._pres, this._preq, this._iat, this._ia, this._rat, this._ra)
  ]);

  if (this._pcnf.toString('hex') === pcnf.toString('hex')) {
    var stk = crypto.s1(this._tk, r, this._r);

    this.emit('stk', stk);
  } else {
    this.write(new Buffer([
      SMP_PAIRING_RANDOM,
      SMP_PAIRING_CONFIRM
    ]));

    this.emit('fail');
  }
};

*/


Smp.prototype.handlePairingFailed = function(data) {
  debug('Pairing Failed!');
  debug('\t\tReason: ' + data[1].toString(16));
  this.emit('fail');
};


Smp.prototype.handleEncryptInfo = function(data) {
  var ltk = data.slice(1);
  debug("Encrypt Info");
  debug("The LTK is: " + ltk);
  this.emit('ltk', ltk);
};

Smp.prototype.handleMasterIdent = function(data) {
  var ediv = data.slice(1, 3);
  var rand = data.slice(3);

  this.emit('masterIdent', ediv, rand);
};

Smp.prototype.write = function(data) {
  this._aclStream.write(SMP_CID, data);
};

module.exports = Smp;
