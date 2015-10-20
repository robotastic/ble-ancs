var events = require('events');
var util = require('util');

var EVENT_ID = [
  'added',
  'modified',
  'removed'
];

var CATEGORY_ID = [
  'other',
  'incomingCall',
  'missedCall',
  'voicemail',
  'social',
  'schedule',
  'email',
  'news',
  'healthAndFitness',
  'businessAndFinance',
  'location',
  'entertianment'
];

var APP_IDENTIFIER = 0;
var TITLE          = 1;
var SUBTITLE       = 2;
var MESSAGE        = 3;
var MESSAGE_SIZE   = 4;
var DATE           = 5;
var POSITIVE_LABEL = 6;
var NEGATIVE_LABEL = 7;

var ATTRIBUTE_ID = [
  'appIdentifier',
  'title',
  'subtitle',
  'message',
  'messageSize',
  'date',
  'positiveLabel',
  'negativeLabel'
];

var Notification = function(ancs, data) {
  var eventId = data.readUInt8(0);
  var eventFlags = data.readUInt8(1);
  var categoryId = data.readUInt8(2);
  var categoryCount = data.readUInt8(3);
  var uid = data.readUInt32LE(4);

  this._ancs = ancs;
  this._buffer = '';

  this.event = EVENT_ID[eventId];
  this.flags = [];

  if (eventFlags & 1) {
    this.flags.push('silent');
  }

  if (eventFlags & 1) {
    this.flags.push('important');
  }

  this.category = CATEGORY_ID[categoryId];
  this.categoryCount = categoryCount;

  this.uid = uid;

  this.on('data', this.onData.bind(this));
};

util.inherits(Notification, events.EventEmitter);

Notification.prototype.toString = function() {
  return JSON.stringify({
    event: this.event,
    flags: this.flags,
    category: this.category,
    categoryCount: this.categoryCount,
    uid: this.uid,
    title: this.title,
    subtitle: this.subtitle,
    message: this.message,
    messageSize: this.messageSize,
    date: this.date,
    positiveLabel: this.positiveLabel,
    negativeLabel: this.negativeLabel
  });
};

Notification.prototype.onData = function(data) {
  // console.log('notification data = ' + data.toString('hex'));

  this._buffer += data.toString('hex');
  data = new Buffer(this._buffer, 'hex');

  var attributeId = data.readUInt8(0);
  var attributeLength = data.readUInt16LE(1);
  var attributeData = data.slice(3);

  if (attributeLength === attributeData.length) {
    if (attributeId === APP_IDENTIFIER) {
      var appIdentifier = this.appIdentifier = attributeData.toString();

      this.emit('appIdentifier', appIdentifier);
    } else if (attributeId === TITLE) {
      var title = this.title = attributeData.toString();

      this.emit('title', title);
    } else if (attributeId === SUBTITLE) {
      var subtitle = this.subtitle = attributeData.toString();

      this.emit('subtitle', subtitle);
    } else if (attributeId === MESSAGE) {
      var message = this.message = attributeData.toString();

      this.emit('message', message);
    } else if (attributeId === MESSAGE_SIZE) {
      var messageSize = this.messageSize = parseInt(attributeData.toString(), 10);

      this.emit('messageSize', messageSize);
    } else if (attributeId === DATE) {
      var dateString = attributeData.toString();

      var year = parseInt(dateString.substring(0, 4), 10);
      var month = parseInt(dateString.substring(4, 6), 10);
      var day = parseInt(dateString.substring(6, 8), 10);

      var hours = parseInt(dateString.substring(9, 11), 10);
      var minutes = parseInt(dateString.substring(11, 13), 10);
      var seconds = parseInt(dateString.substring(13, 15), 10);

      var date = this.date = new Date(year, month, day, hours, minutes, seconds);

      this.emit('date', date);
    } else if (attributeId === POSITIVE_LABEL) {
      var positiveLabel = this.positiveLabel = attributeData.toString();

      this.emit('positiveLabel', positiveLabel);
    } else if (attributeId === NEGATIVE_LABEL) {
      var negativeLabel = this.negativeLabel = attributeData.toString();

      this.emit('negativeLabel', negativeLabel);
    }

    this._buffer = '';
  }
};

Notification.prototype.readAppIdentifier = function(callback) {
  this.once('appIdentifier', function(appIdentifier) {
    callback(appIdentifier);
  });

  this._ancs.requestNotificationAttribute(this.uid, APP_IDENTIFIER);
};

Notification.prototype.readTitle = function(callback) {
  this.once('title', function(title) {
    callback(title);
  });

  this._ancs.requestNotificationAttribute(this.uid, TITLE, 255);
};

Notification.prototype.readSubtitle = function(callback) {
  this.once('subtitle', function(subtitle) {
    callback(subtitle);
  });

  this._ancs.requestNotificationAttribute(this.uid, SUBTITLE, 255);
};

Notification.prototype.readMessage = function(callback) {
  this.readMessageSize(function(messageSize) {
    this.once('message', function(message) {
      callback(message);
    });

    this._ancs.requestNotificationAttribute(this.uid, MESSAGE, messageSize);
  }.bind(this));
};

Notification.prototype.readMessageSize = function(callback) {
  this.once('messageSize', function(messageSize) {
    callback(messageSize);
  });

  this._ancs.requestNotificationAttribute(this.uid, MESSAGE_SIZE);
};

Notification.prototype.readDate = function(callback) {
  this.once('date', function(date) {
    callback(date);
  });

  this._ancs.requestNotificationAttribute(this.uid, DATE);
};

Notification.prototype.readPositiveLabel = function(callback) {
  this.once('positiveLabel', function(positiveLabel) {
    callback(positiveLabel);
  });

  this._ancs.requestNotificationAttribute(this.uid, POSITIVE_LABEL, 255);
};

Notification.prototype.readNegativeLabel = function(callback) {
  this.once('negativeLabel', function(negativeLabel) {
    callback(negativeLabel);
  });

  this._ancs.requestNotificationAttribute(this.uid, NEGATIVE_LABEL, 255);
};

Notification.prototype.readAttributes = function(callback) {
  this.readAppIdentifier(function(appIdentifier) {
    this.readTitle(function(title) {
      this.readSubtitle(function(subtitle) {
        this.readMessage(function(message) {
          this.readDate(function(date) {
                  callback({
                  appIdentifier: appIdentifier,
                  title: title,
                  subtitle: subtitle,
                  message: message,
                  date: date
                });
          }.bind(this));
        }.bind(this));
      }.bind(this));
    }.bind(this));
  }.bind(this));
};

module.exports = Notification;
