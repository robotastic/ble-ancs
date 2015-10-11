var debug = require('debug')('descriptor');

var UuidUtil = require('./uuid-util');

function LocalDescriptor(options) {
  this.uuid = UuidUtil.removeDashes(options.uuid);
  this.value = options.value || new Buffer(0);
}

LocalDescriptor.prototype.toString = function() {
  return JSON.stringify({
    uuid: this.uuid,
    value: Buffer.isBuffer(this.value) ? this.value.toString('hex') : this.value
  });
};

module.exports = LocalDescriptor;
