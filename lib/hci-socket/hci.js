var debug = require('debug')('hci');

var events = require('events');
var util = require('util');

var BluetoothHciSocket = require('bluetooth-hci-socket');


var ATT_OP_ERROR = 0x01;
var ATT_OP_MTU_REQ = 0x02;
var ATT_OP_MTU_RESP = 0x03;
var ATT_OP_FIND_INFO_REQ = 0x04;
var ATT_OP_FIND_INFO_RESP = 0x05;
var ATT_OP_FIND_BY_TYPE_REQ = 0x06;
var ATT_OP_FIND_BY_TYPE_RESP = 0x07;
var ATT_OP_READ_BY_TYPE_REQ = 0x08;
var ATT_OP_READ_BY_TYPE_RESP = 0x09;
var ATT_OP_READ_REQ = 0x0a;
var ATT_OP_READ_RESP = 0x0b;
var ATT_OP_READ_BLOB_REQ = 0x0c;
var ATT_OP_READ_BLOB_RESP = 0x0d;
var ATT_OP_READ_MULTI_REQ = 0x0e;
var ATT_OP_READ_MULTI_RESP = 0x0f;
var ATT_OP_READ_BY_GROUP_REQ = 0x10;
var ATT_OP_READ_BY_GROUP_RESP = 0x11;
var ATT_OP_WRITE_REQ = 0x12;
var ATT_OP_WRITE_RESP = 0x13;
var ATT_OP_WRITE_CMD = 0x52;
var ATT_OP_PREP_WRITE_REQ = 0x16;
var ATT_OP_PREP_WRITE_RESP = 0x17;
var ATT_OP_EXEC_WRITE_REQ = 0x18;
var ATT_OP_EXEC_WRITE_RESP = 0x19;
var ATT_OP_HANDLE_NOTIFY = 0x1b;
var ATT_OP_HANDLE_IND = 0x1d;
var ATT_OP_HANDLE_CNF = 0x1e;
var ATT_OP_WRITE_CMD = 0x52;
var ATT_OP_SIGNED_WRITE_CMD = 0xd2;

var HCI_COMMAND_PKT = 0x01;
var HCI_ACLDATA_PKT = 0x02;
var HCI_EVENT_PKT = 0x04;

var ACL_START_NO_FLUSH = 0x00;
var ACL_CONT = 0x01;
var ACL_START = 0x02;

var EVT_DISCONN_COMPLETE = 0x05;
var EVT_ENCRYPT_CHANGE = 0x08;
var EVT_CMD_COMPLETE = 0x0e;
var EVT_CMD_STATUS = 0x0f;
var EVT_LE_META_EVENT = 0x3e;

var EVT_LE_CONN_COMPLETE = 0x01;
var EVT_LE_ADVERTISING_REPORT = 0x02;
var EVT_LE_CONN_UPDATE_COMPLETE = 0x03;

var OGF_LINK_CTL = 0x01;
var OCF_DISCONNECT = 0x0006;

var OGF_HOST_CTL = 0x03;
var OCF_SET_EVENT_MASK = 0x0001;

var OGF_INFO_PARAM = 0x04;
var OCF_READ_LOCAL_VERSION = 0x0001;
var OCF_READ_BD_ADDR = 0x0009;

var OGF_STATUS_PARAM = 0x05;
var OCF_READ_RSSI = 0x0005;

var OGF_LE_CTL = 0x08;
var OCF_LE_SET_EVENT_MASK = 0x0001;
var OCF_LE_SET_ADVERTISING_PARAMETERS = 0x0006;
var OCF_LE_SET_ADVERTISING_DATA = 0x0008;
var OCF_LE_SET_SCAN_RESPONSE_DATA = 0x0009;
var OCF_LE_SET_ADVERTISE_ENABLE = 0x000a;
var OCF_LE_LTK_NEG_REPLY = 0x001B;
var OCF_LE_SET_SCAN_PARAMETERS = 0x000b;
var OCF_LE_SET_SCAN_ENABLE = 0x000c;
var OCF_LE_CREATE_CONN = 0x000d;
var OCF_LE_START_ENCRYPTION = 0x0019;

var DISCONNECT_CMD = OCF_DISCONNECT | OGF_LINK_CTL << 10;

var SET_EVENT_MASK_CMD = OCF_SET_EVENT_MASK | OGF_HOST_CTL << 10;

var READ_LOCAL_VERSION_CMD = OCF_READ_LOCAL_VERSION | (OGF_INFO_PARAM << 10);
var READ_BD_ADDR_CMD = OCF_READ_BD_ADDR | (OGF_INFO_PARAM << 10);

var READ_RSSI_CMD = OCF_READ_RSSI | OGF_STATUS_PARAM << 10;

var LE_SET_EVENT_MASK_CMD = OCF_SET_EVENT_MASK | OGF_LE_CTL << 10;
var LE_SET_SCAN_PARAMETERS_CMD = OCF_LE_SET_SCAN_PARAMETERS | OGF_LE_CTL << 10;
var LE_SET_SCAN_ENABLE_CMD = OCF_LE_SET_SCAN_ENABLE | OGF_LE_CTL << 10;
var LE_CREATE_CONN_CMD = OCF_LE_CREATE_CONN | OGF_LE_CTL << 10;
var LE_START_ENCRYPTION_CMD = OCF_LE_START_ENCRYPTION | OGF_LE_CTL << 10;
var LE_SET_ADVERTISING_PARAMETERS_CMD = OCF_LE_SET_ADVERTISING_PARAMETERS | OGF_LE_CTL << 10;
var LE_SET_ADVERTISING_DATA_CMD = OCF_LE_SET_ADVERTISING_DATA | OGF_LE_CTL << 10;
var LE_SET_SCAN_RESPONSE_DATA_CMD = OCF_LE_SET_SCAN_RESPONSE_DATA | OGF_LE_CTL << 10;
var LE_SET_ADVERTISE_ENABLE_CMD = OCF_LE_SET_ADVERTISE_ENABLE | OGF_LE_CTL << 10;
var LE_LTK_NEG_REPLY_CMD = OCF_LE_LTK_NEG_REPLY | OGF_LE_CTL << 10;

var HCI_OE_USER_ENDED_CONNECTION = 0x13;

var STATUS_MAPPER = require('./hci-status');

var Hci = function () {
    this._socket = new BluetoothHciSocket();
    this._isDevUp = null;
    this._state = null;
    this._handleBuffers = {};
    this.on('stateChange', this.onStateChange.bind(this));
};

util.inherits(Hci, events.EventEmitter);

Hci.STATUS_MAPPER = STATUS_MAPPER;

Hci.prototype.init = function () {
    this._socket.on('data', this.onSocketData.bind(this));
    this._socket.on('error', this.onSocketError.bind(this));

    var deviceId = process.env.ABLE_HCI_DEVICE_ID ? parseInt(process.env.ABLE_HCI_DEVICE_ID, 10) : undefined;

    this._socket.bindRaw(deviceId);
    //this._socket.bindUser(deviceId);
    this._socket.start();

    this.pollIsDevUp();
};

Hci.prototype.pollIsDevUp = function () {
    var isDevUp = this._socket.isDevUp();

    if (this._isDevUp !== isDevUp) {
        if (isDevUp) {
            this.setSocketFilter();
            this.setEventMask();
            this.setLeEventMask();
            this.readLocalVersion();
            this.readBdAddr();
        } else {
            this.emit('stateChange', 'poweredOff');
        }

        this._isDevUp = isDevUp;
    }

    setTimeout(this.pollIsDevUp.bind(this), 1000);
};

Hci.prototype.setSocketFilter = function () {
    var filter = new Buffer(14);
    var typeMask = (1 << HCI_EVENT_PKT) | (1 << HCI_ACLDATA_PKT) | (1 << HCI_COMMAND_PKT);
    var eventMask1 = (1 << EVT_DISCONN_COMPLETE) | (1 << EVT_ENCRYPT_CHANGE) | (1 << EVT_CMD_COMPLETE) | (1 << EVT_CMD_STATUS);
    var eventMask2 = (1 << (EVT_LE_META_EVENT - 32));
    var opcode = 0;

    filter.writeUInt32LE(typeMask, 0);
    filter.writeUInt32LE(eventMask1, 4);
    filter.writeUInt32LE(eventMask2, 8);
    filter.writeUInt16LE(opcode, 12);

    debug('setting filter to: ' + filter.toString('hex'));
    this._socket.setFilter(filter);
};

Hci.prototype.setEventMask = function () {
    var cmd = new Buffer(12);
    var eventMask = new Buffer('fffffbff07f8bf3d', 'hex');

    // header
    cmd.writeUInt8(HCI_COMMAND_PKT, 0);
    cmd.writeUInt16LE(SET_EVENT_MASK_CMD, 1);

    // length
    cmd.writeUInt8(eventMask.length, 3);

    eventMask.copy(cmd, 4);

    debug('set event mask - writing: ' + cmd.toString('hex'));
    this._socket.write(cmd);
};

Hci.prototype.readLocalVersion = function () {
    var cmd = new Buffer(4);

    // header
    cmd.writeUInt8(HCI_COMMAND_PKT, 0);
    cmd.writeUInt16LE(READ_LOCAL_VERSION_CMD, 1);

    // length
    cmd.writeUInt8(0x0, 3);

    debug('read local version - writing: ' + cmd.toString('hex'));
    this._socket.write(cmd);
};

Hci.prototype.readBdAddr = function () {
    var cmd = new Buffer(4);

    // header
    cmd.writeUInt8(HCI_COMMAND_PKT, 0);
    cmd.writeUInt16LE(READ_BD_ADDR_CMD, 1);

    // length
    cmd.writeUInt8(0x0, 3);

    debug('read bd addr - writing: ' + cmd.toString('hex'));
    this._socket.write(cmd);
};

Hci.prototype.setLeEventMask = function () {
    var cmd = new Buffer(12);
    var leEventMask = new Buffer('1f00000000000000', 'hex');

    // header
    cmd.writeUInt8(HCI_COMMAND_PKT, 0);
    cmd.writeUInt16LE(LE_SET_EVENT_MASK_CMD, 1);

    // length
    cmd.writeUInt8(leEventMask.length, 3);

    leEventMask.copy(cmd, 4);

    debug('set le event mask - writing: ' + cmd.toString('hex'));
    this._socket.write(cmd);
};

Hci.prototype.setAdvertisingParameters = function () {
    var cmd = new Buffer(19);

    // header
    cmd.writeUInt8(HCI_COMMAND_PKT, 0);
    cmd.writeUInt16LE(LE_SET_ADVERTISING_PARAMETERS_CMD, 1);

    // length
    cmd.writeUInt8(15, 3);

    var advertisementInterval = Math.floor((process.env.BLENO_ADVERTISING_INTERVAL ? parseInt(process.env.BLENO_ADVERTISING_INTERVAL) : 20) * 1.6);

    // data
    cmd.writeUInt16LE(advertisementInterval, 4); // min interval
    cmd.writeUInt16LE(advertisementInterval, 6); // max interval
    cmd.writeUInt8(0x00, 8); // adv type
    cmd.writeUInt8(0x00, 9); // own addr typ
    cmd.writeUInt8(0x00, 10); // direct addr type
    (new Buffer('000000000000', 'hex')).copy(cmd, 11); // direct addr
    cmd.writeUInt8(0x07, 17);
    cmd.writeUInt8(0x00, 18);

    debug('set advertisement parameters - writing: ' + cmd.toString('hex'));
    this._socket.write(cmd);
};

Hci.prototype.setAdvertisingData = function (data) {
    var cmd = new Buffer(36);

    cmd.fill(0x00);

    // header
    cmd.writeUInt8(HCI_COMMAND_PKT, 0);
    cmd.writeUInt16LE(LE_SET_ADVERTISING_DATA_CMD, 1);

    // length
    cmd.writeUInt8(32, 3);

    // data
    cmd.writeUInt8(data.length, 4);
    data.copy(cmd, 5);

    debug('set advertisement data - writing: ' + cmd.toString('hex'));
    this._socket.write(cmd);
};

Hci.prototype.setScanResponseData = function (data) {
    var cmd = new Buffer(36);

    cmd.fill(0x00);

    // header
    cmd.writeUInt8(HCI_COMMAND_PKT, 0);
    cmd.writeUInt16LE(LE_SET_SCAN_RESPONSE_DATA_CMD, 1);

    // length
    cmd.writeUInt8(32, 3);

    // data
    cmd.writeUInt8(data.length, 4);
    data.copy(cmd, 5);

    debug('set scan response data - writing: ' + cmd.toString('hex'));
    this._socket.write(cmd);
};

Hci.prototype.setAdvertiseEnable = function (enabled) {
    var cmd = new Buffer(5);

    // header
    cmd.writeUInt8(HCI_COMMAND_PKT, 0);
    cmd.writeUInt16LE(LE_SET_ADVERTISE_ENABLE_CMD, 1);

    // length
    cmd.writeUInt8(0x01, 3);

    // data
    cmd.writeUInt8(enabled ? 0x01 : 0x00, 4); // enable: 0 -> disabled, 1 -> enabled

    debug('set advertise enable - writing: ' + cmd.toString('hex'));
    this._socket.write(cmd);
};

Hci.prototype.setScanParameters = function () {
    var cmd = new Buffer(11);

    // header
    cmd.writeUInt8(HCI_COMMAND_PKT, 0);
    cmd.writeUInt16LE(LE_SET_SCAN_PARAMETERS_CMD, 1);

    // length
    cmd.writeUInt8(0x07, 3);

    // data
    cmd.writeUInt8(0x01, 4); // type: 0 -> passive, 1 -> active
    cmd.writeUInt16LE(0x0010, 5); // internal, ms * 1.6
    cmd.writeUInt16LE(0x0010, 7); // window, ms * 1.6
    cmd.writeUInt8(0x00, 9); // own address type: 0 -> public, 1 -> random
    cmd.writeUInt8(0x00, 10); // filter: 0 -> all event types

    debug('set scan parameters - writing: ' + cmd.toString('hex'));
    this._socket.write(cmd);
};

Hci.prototype.setScanEnabled = function (enabled, filterDuplicates) {
    var cmd = new Buffer(6);

    // header
    cmd.writeUInt8(HCI_COMMAND_PKT, 0);
    cmd.writeUInt16LE(LE_SET_SCAN_ENABLE_CMD, 1);

    // length
    cmd.writeUInt8(0x02, 3);

    // data
    cmd.writeUInt8(enabled ? 0x01 : 0x00, 4); // enable: 0 -> disabled, 1 -> enabled
    cmd.writeUInt8(filterDuplicates ? 0x01 : 0x00, 5); // duplicates: 0 -> duplicates, 0 -> duplicates

    debug('set scan enabled - writing: ' + cmd.toString('hex'));
    this._socket.write(cmd);
};

Hci.prototype.createLeConn = function (address, addressType) {
    var cmd = new Buffer(29);

    // header
    cmd.writeUInt8(HCI_COMMAND_PKT, 0);
    cmd.writeUInt16LE(LE_CREATE_CONN_CMD, 1);

    // length
    cmd.writeUInt8(0x19, 3);

    // data
    cmd.writeUInt16LE(0x0060, 4); // interval
    cmd.writeUInt16LE(0x0030, 6); // window
    cmd.writeUInt8(0x00, 8); // initiator filter

    cmd.writeUInt8(addressType === 'random' ? 0x01 : 0x00, 9); // peer address type
    (new Buffer(address.split(':').reverse().join(''), 'hex')).copy(cmd, 10); // peer address

    cmd.writeUInt8(0x00, 16); // own address type

    cmd.writeUInt16LE(0x0006, 17); // min interval
    cmd.writeUInt16LE(0x000c, 19); // max interval
    cmd.writeUInt16LE(0x0000, 21); // latency
    cmd.writeUInt16LE(0x00c8, 23); // supervision timeout
    cmd.writeUInt16LE(0x0004, 25); // min ce length
    cmd.writeUInt16LE(0x0006, 27); // max ce length

    debug('create le conn - writing: ' + cmd.toString('hex'));
    this._socket.write(cmd);
};


Hci.prototype.startLeEncryption = function (handle, random, diversifier, key) {
    var cmd = new Buffer(32);

    // header
    cmd.writeUInt8(HCI_COMMAND_PKT, 0);
    cmd.writeUInt16LE(LE_START_ENCRYPTION_CMD, 1);

    // length
    cmd.writeUInt8(0x1c, 3);

    // data
    cmd.writeUInt16LE(handle, 4); // handle
    random.copy(cmd, 6);
    diversifier.copy(cmd, 14);
    key.copy(cmd, 16);

    debug('start le encryption - writing: ' + cmd.toString('hex'));
    this._socket.write(cmd);
};

Hci.prototype.disconnect = function (handle, reason) {
    var cmd = new Buffer(7);

    reason = reason || HCI_OE_USER_ENDED_CONNECTION;

    // header
    cmd.writeUInt8(HCI_COMMAND_PKT, 0);
    cmd.writeUInt16LE(DISCONNECT_CMD, 1);

    // length
    cmd.writeUInt8(0x03, 3);

    // data
    cmd.writeUInt16LE(handle, 4); // handle
    cmd.writeUInt8(reason, 6); // reason

    debug('disconnect - writing: ' + cmd.toString('hex'));
    this._socket.write(cmd);
};

Hci.prototype.readRssi = function (handle) {
    var cmd = new Buffer(6);

    // header
    cmd.writeUInt8(HCI_COMMAND_PKT, 0);
    cmd.writeUInt16LE(READ_RSSI_CMD, 1);

    // length
    cmd.writeUInt8(0x02, 3);

    // data
    cmd.writeUInt16LE(handle, 4); // handle

    debug('read rssi - writing: ' + cmd.toString('hex'));
    this._socket.write(cmd);
};

Hci.prototype.writeAclDataPkt = function (handle, cid, data) {
    var pkt = new Buffer(9 + data.length);

    // header
    pkt.writeUInt8(HCI_ACLDATA_PKT, 0);
    pkt.writeUInt16LE(handle | ACL_START_NO_FLUSH << 12, 1);
    pkt.writeUInt16LE(data.length + 4, 3); // data length 1
    pkt.writeUInt16LE(data.length, 5); // data length 2
    pkt.writeUInt16LE(cid, 7);

    data.copy(pkt, 9);

    debug('write acl data pkt - writing: ' + pkt.toString('hex'));
    this._socket.write(pkt);
};


Hci.prototype.debugPacketType = function (type) {
    switch (type) {
        case ATT_OP_ERROR:
            debug('\t\ttype = ATT_OP_ERROR: ');
            break;

        case ATT_OP_MTU_REQ:
            debug('\t\ttype = ATT_OP_MTU_REQ: ');
            break;

        case ATT_OP_FIND_INFO_REQ:
            debug('\t\ttype = ATT_OP_FIND_INFO_REQ: ');
            break;

        case ATT_OP_FIND_BY_TYPE_REQ:
            debug('\t\ttype = ATT_OP_FIND_BY_TYPE_REQ: ');
            break;

        case ATT_OP_READ_BY_TYPE_REQ:
            debug('\t\ttype = ATT_OP_READ_BY_TYPE_REQ:');
            break;

        case ATT_OP_READ_REQ:
        case ATT_OP_READ_BLOB_REQ:
            debug('\t\ttype = ATT_OP_READ_REQ: ');
            break;

        case ATT_OP_READ_BY_GROUP_REQ:
            debug('\t\ttype = ATT_OP_READ_BY_GROUP_REQ: ');
            break;

        case ATT_OP_WRITE_REQ:
        case ATT_OP_WRITE_CMD:
            debug('\t\ttype = ATT_OP_WRITE_REQ: ');
            break;

        case ATT_OP_HANDLE_CNF:
            debug('\t\ttype = ATT_OP_HANDLE_CNF: ');
            break;
        case ATT_OP_ERROR:
            debug('\t\ttype = ATT_OP_ERROR: ');

            break;
        case ATT_OP_READ_BY_TYPE_RESP:
            debug('\t\ttype = ATT_OP_READ_BY_TYPE_RESP: ');
            break;
        case ATT_OP_READ_BY_GROUP_RESP:
            debug('\t\ttype = ATT_OP_READ_BY_GROUP_RESP: ');
            break;
        case ATT_OP_HANDLE_NOTIFY:
        case ATT_OP_HANDLE_IND:
            debug('\t\ttype = ATT_OP_HANDLE_NOTIFY: ');

        default:
        case ATT_OP_READ_MULTI_REQ:
        case ATT_OP_PREP_WRITE_REQ:
        case ATT_OP_EXEC_WRITE_REQ:
        case ATT_OP_SIGNED_WRITE_CMD:
            debug('\t\ttype =  Unhandled: ' + type);
            break;
    }
};
Hci.prototype.onSocketData = function (data) {


    var eventType = data.readUInt8(0);
    var handle;
    var cmd;
    var status;

    debug('onSocketData: ' + data.toString('hex') + '\tevent type = ' + eventType);

    if (HCI_EVENT_PKT === eventType) {
        var subEventType = data.readUInt8(1);

        debug('\tsub event type = ' + subEventType);

        if (subEventType === EVT_DISCONN_COMPLETE) {
            handle = data.readUInt16LE(4);
            var reason = data.readUInt8(6);

            debug('\t\tEVT_DISCONN_COMPLETE');
            debug('\t\thandle = ' + handle);
            debug('\t\treason = ' + reason);
            debug('emitting disconnComplete');
            var listened = this.emit('disconnComplete', handle, reason);
            debug('Did someone hear: ' + listened);
        } else if (subEventType === EVT_ENCRYPT_CHANGE) {
            handle = data.readUInt16LE(4);
            var encrypt = data.readUInt8(6);

            debug('\t\tEVT_ENCRYPT_CHANGE');
            debug('\t\thandle = ' + handle);
            debug('\t\tencrypt = ' + encrypt);

            this.emit('encryptChange', handle, encrypt);
        } else if (subEventType === EVT_CMD_COMPLETE) {
            cmd = data.readUInt16LE(4);
            status = data.readUInt8(6);
            var result = data.slice(7);

            debug('\t\tEVT_CMD_COMPLETE');
            debug('\t\tcmd = ' + cmd);
            debug('\t\tstatus = ' + status);
            debug('\t\tresult = ' + result.toString('hex'));

            this.processCmdCompleteEvent(cmd, status, result);
        } else if (subEventType === EVT_CMD_STATUS) {
            status = data.readUInt8(3);
            cmd = data.readUInt16LE(5);

            debug('\t\tstatus = ' + status);
            debug('\t\tcmd = ' + cmd);

            this.processCmdStatusEvent(cmd, status);
        } else if (subEventType === EVT_LE_META_EVENT) {
            var leMetaEventType = data.readUInt8(3);
            var leMetaEventStatus = data.readUInt8(4);
            var leMetaEventData = data.slice(5);

            debug('\t\tEVT_LE_META_EVENT');
            debug('\t\tLE meta event type = ' + leMetaEventType);
            debug('\t\tLE meta event status = ' + leMetaEventStatus);
            debug('\t\tLE meta event data = ' + leMetaEventData.toString('hex'));

            this.processLeMetaEvent(leMetaEventType, leMetaEventStatus, leMetaEventData);
        } else {
            debug('\t\tUnknown Command');
        }
    } else if (HCI_ACLDATA_PKT === eventType) {
        var flags = data.readUInt16LE(1) >> 12;
        handle = data.readUInt16LE(1) & 0x0fff;

        if (ACL_START === flags) {
            var cid = data.readUInt16LE(7);

            var length = data.readUInt16LE(5);
            var pktData = data.slice(9);

            debug('\t\tHCI_ACLDATA_PKT - ACL_START');
            debug('\t\tcid = ' + cid);
            this.debugPacketType(pktData[0]);
            if (length === pktData.length) {
                debug('\t\thandle = ' + handle);
                debug('\t\tdata = ' + pktData.toString('hex'));

                this.emit('aclDataPkt', handle, cid, pktData);
            } else {
                this._handleBuffers[handle] = {
                    length: length,
                    cid: cid,
                    data: pktData
                };
            }
        }
        /*else if (ACL_START_NO_FLUSH === flags) {
             var cid = data.readUInt16LE(7);

             var length = data.readUInt16LE(5);
             var pktData = data.slice(9);

             debug('\t\tHCI_ACLDATA_PKT - ACL_START_NO_FLUSH');
             debug('\t\tcid = ' + cid);
             this.debugPacketType(pktData[0]);
             if (length === pktData.length) {
               debug('\t\thandle = ' + handle);
               debug('\t\tdata = ' + pktData.toString('hex'));

               this.emit('aclDataPkt', handle, cid, pktData);
             } else {
               this._handleBuffers[handle] = {
                 length: length,
                 cid: cid,
                 data: pktData
               };
             }

           } */
        else if (ACL_CONT === flags) {
            debug('\t\tHCI_ACLDATA_PKT - ACL_CONT');
            if (!this._handleBuffers[handle] || !this._handleBuffers[handle].data) {
                debug('!\tUnable to find previous packets');
                return;
            }

            this._handleBuffers[handle].data = Buffer.concat([
        this._handleBuffers[handle].data,
        data.slice(5)
      ]);

            if (this._handleBuffers[handle].data.length === this._handleBuffers[handle].length) {
                debug('\t\tCOMPLETE');
                this.emit('aclDataPkt', handle, this._handleBuffers[handle].cid, this._handleBuffers[handle].data);
                delete this._handleBuffers[handle];
            }
        }
    } else if (HCI_COMMAND_PKT === eventType) {
        cmd = data.readUInt16LE(1);
        var len = data.readUInt8(3);

        debug('\t\tcmd = ' + cmd);
        debug('\t\tdata len = ' + len);

        if (cmd === LE_SET_SCAN_ENABLE_CMD) {
            var enable = (data.readUInt8(4) === 0x1);
            var filter_dups = (data.readUInt8(5) === 0x1);

            debug('\t\t\tLE enable scan command');
            debug('\t\t\tenable scanning = ' + enable);
            debug('\t\t\tfilter duplicates = ' + filter_dups);

            this.emit('cmdLeScanEnableSet', enable, filter_dups);

            debug('\t\tUnknown Flags for HCI_ACLDATA_PKT: ' + flags)
        }
    } else {
        debug('!\tPacket unhandled');
    }
};

Hci.prototype.onSocketError = function (error) {
    debug('onSocketError: ' + error.message);

    if (error.message === 'Operation not permitted') {
        this.emit('stateChange', 'unauthorized');
    } else if (error.message === 'Network is down') {
        // no-op
    }
};

Hci.prototype.processCmdCompleteEvent = function (cmd, status, result) {
    var handle;

    if (cmd === READ_LOCAL_VERSION_CMD) {
        var hciVer = result.readUInt8(0);
        var hciRev = result.readUInt16LE(1);
        var lmpVer = result.readInt8(3);
        var manufacturer = result.readUInt16LE(4);
        var lmpSubVer = result.readUInt16LE(6);

        if (hciVer < 0x06) {
            this.emit('stateChange', 'unsupported');
        } else if (this._state !== 'poweredOn') {
            this.setScanEnabled(false, true);
            this.setScanParameters();
        }
        debug('\t\tREAD_LOCAL_VERSION_CMD');
        this.emit('readLocalVersion', hciVer, hciRev, lmpVer, manufacturer, lmpSubVer);
    } else if (cmd === READ_BD_ADDR_CMD) {
        this.addressType = 'public';
        this.address = result.toString('hex').match(/.{1,2}/g).reverse().join(':');


        debug('\t\tREAD_BD_ADDR_CMD');
        this.emit('addressChange', this.address);
    } else if (cmd === LE_SET_ADVERTISING_PARAMETERS_CMD) {
        this.emit('stateChange', 'poweredOn');

        debug('\t\tLE_SET_ADVERTISING_PARAMETERS_CMD');
        this.emit('leAdvertisingParametersSet', status);
    } else if (cmd === LE_SET_SCAN_PARAMETERS_CMD) {
        this.emit('stateChange', 'poweredOn');

        debug('\t\tLE_SET_SCAN_PARAMETERS_CMD');
        this.emit('leScanParametersSet');
    } else if (cmd === LE_SET_SCAN_ENABLE_CMD) {
        debug('\t\tLE_SET_SCAN_ENABLE_CMD');
        this.emit('leScanEnableSet', status);
    } else if (cmd === LE_SET_ADVERTISING_DATA_CMD) {
        debug('\t\tLE_SET_ADVERTISING_DATA_CMD');
        this.emit('leAdvertisingDataSet', status);
    } else if (cmd === LE_SET_SCAN_RESPONSE_DATA_CMD) {
        debug('\t\tLE_SET_SCAN_RESPONSE_DATA_CMD');
        this.emit('leScanResponseDataSet', status);
    } else if (cmd === LE_SET_ADVERTISE_ENABLE_CMD) {
        debug('\t\tLE_SET_ADVERTISE_ENABLE_CMD');
        this.emit('leAdvertiseEnableSet', status);
    } else if (cmd === READ_RSSI_CMD) {
        handle = result.readUInt16LE(0);
        var rssi = result.readInt8(2);
        debug('\t\tREAD_RSSI_CMD');
        debug('\t\t\thandle = ' + handle);
        debug('\t\t\trssi = ' + rssi);

        this.emit('rssiRead', handle, rssi);
    } else if (cmd === LE_LTK_NEG_REPLY_CMD) {
        handle = result.readUInt16LE(0);
        debug('\t\tLE_LTK_NEG_REPLY_CMD');
        debug('\t\t\thandle = ' + handle);
        this.emit('leLtkNegReply', handle);
    } else {
        debug('!\tUnhandled Command: ' + cmd);
    }
};

Hci.prototype.onStateChange = function (state) {
    this._state = state;
};

Hci.prototype.processLeMetaEvent = function (eventType, status, data) {
    if (eventType === EVT_LE_CONN_COMPLETE) {
        this.processLeConnComplete(status, data);
    } else if (eventType === EVT_LE_ADVERTISING_REPORT) {
        this.processLeAdvertisingReport(status, data);
    } else if (eventType === EVT_LE_CONN_UPDATE_COMPLETE) {
        this.processLeConnUpdateComplete(status, data);
    }
};

Hci.prototype.processLeConnComplete = function (status, data) {
    var handle = data.readUInt16LE(0);
    var role = data.readUInt8(2);
    var addressType = data.readUInt8(3) === 0x01 ? 'random' : 'public';
    var address = data.slice(4, 10).toString('hex').match(/.{1,2}/g).reverse().join(':');
    var interval = data.readUInt16LE(10) * 1.25;
    var latency = data.readUInt16LE(12); // TODO: multiplier?
    var supervisionTimeout = data.readUInt16LE(14) * 10;
    var masterClockAccuracy = data.readUInt8(16); // TODO: multiplier?

    debug('\t\t\thandle = ' + handle);
    debug('\t\t\trole = ' + role);
    debug('\t\t\taddress type = ' + addressType);
    debug('\t\t\taddress = ' + address);
    debug('\t\t\tinterval = ' + interval);
    debug('\t\t\tlatency = ' + latency);
    debug('\t\t\tsupervision timeout = ' + supervisionTimeout);
    debug('\t\t\tmaster clock accuracy = ' + masterClockAccuracy);

    this.emit('leConnComplete', status, handle, role, addressType, address, interval, latency, supervisionTimeout, masterClockAccuracy);
};

Hci.prototype.processLeAdvertisingReport = function (status, data) {
    var type = data.readUInt8(0); // ignore for now
    var addressType = data.readUInt8(1) === 0x01 ? 'random' : 'public';
    var address = data.slice(2, 8).toString('hex').match(/.{1,2}/g).reverse().join(':');
    var eir = data.slice(9, data.length - 1);
    var rssi = data.readInt8(data.length - 1);

    debug('\t\t\ttype = ' + type);
    debug('\t\t\taddress = ' + address);
    debug('\t\t\taddress type = ' + addressType);
    debug('\t\t\teir = ' + eir.toString('hex'));
    debug('\t\t\trssi = ' + rssi);

    this.emit('leAdvertisingReport', status, type, address, addressType, eir, rssi);
};

Hci.prototype.processLeConnUpdateComplete = function (status, data) {
    var handle = data.readUInt16LE(0);
    var interval = data.readUInt16LE(2) * 1.25;
    var latency = data.readUInt16LE(4); // TODO: multiplier?
    var supervisionTimeout = data.readUInt16LE(6) * 10;

    debug('\t\t\thandle = ' + handle);
    debug('\t\t\tinterval = ' + interval);
    debug('\t\t\tlatency = ' + latency);
    debug('\t\t\tsupervision timeout = ' + supervisionTimeout);

    this.emit('leConnUpdateComplete', status, handle, interval, latency, supervisionTimeout);
};
Hci.prototype.processCmdStatusEvent = function (cmd, status) {
    if (cmd === LE_CREATE_CONN_CMD) {
        if (status !== 0) {
            this.emit('leConnComplete', status);
        }
    }
};

module.exports = Hci;
