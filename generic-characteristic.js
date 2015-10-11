var util = require('util'),
  Able = require('./index'),
  Descriptor = require('./lib/local-characteristic'),
  Characteristic = require('./lib/local-characteristic');//Able.Characteristic;

var GenericCharacteristic = function() {
  GenericCharacteristic.super_.call(this, {
      uuid: '2803',
      properties: ['read'],
      secure: ['read'],
      descriptors: [
        new Descriptor({
            uuid: '2901',
            value: 'Generic!'
        }),
        new Descriptor({
            uuid: '2904',
            value: new Buffer([0x04, 0x01, 0x27, 0xAD, 0x01, 0x00, 0x00 ]) // maybe 12 0xC unsigned 8 bit
        })
      ]
  });
};

util.inherits(GenericCharacteristic, Characteristic);

GenericCharacteristic.prototype.onReadRequest = function(offset, callback) {


    // return hardcoded value
    callback(this.RESULT_SUCCESS, new Buffer([98]));
  
};

module.exports = GenericCharacteristic;
