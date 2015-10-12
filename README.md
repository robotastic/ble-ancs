# BLE ANCS
===========

This is a NodeJS library that provides Linux systems with notifications from iOS devices via Bluetooth LE, using the [Apple Notification Center Service (ANCS)](https://developer.apple.com/library/ios/documentation/CoreBluetooth/Reference/AppleNotificationCenterServiceSpecification/Introduction/Introduction.html).

This library is mostly a combination of 3 great libraries from [Sandeep Mistry](https://github.com/sandeepmistry):
 * [noble](https://github.com/sandeepmistry/noble) - A Node.js BLE (Bluetooth Low Energy) central module
 * [bleno](https://github.com/sandeepmistry/bleno) - A Node.js module for implementing BLE (Bluetooth Low Energy) peripherals
 * [node-ancs](https://github.com/sandeepmistry/node-ancs) - A node.js lib to access the Apple Notification Center Service (ANCS)

I have combined noble and bleno together so it is possible to easily pivot from being a peripheral to a central role. This allows for a Pairing to be established between the iOS device and the Linux system without any requiring any iOS Apps. You can simply go into the Bluetooth setting and connect with the Linux system to establish an ANCS pairing.

## Prerequisites

### Linux (Ubuntu)

 * Kernel version 3.6 or above
 * ```libbluetooth-dev```

#### Ubuntu/Debian/Raspbian

```sh
sudo apt-get install bluetooth bluez libbluetooth-dev libudev-dev
```

#### Fedora / Other-RPM based

```sh
sudo yum install bluez bluez-libs bluez-libs-devel
```

#### Running without root/sudo

Run the following command:

```sh
sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)
```

This grants the ```node``` binary ```cap_net_raw``` privileges, so it can start/stop BLE advertising.

__Note:__ The above command requires ```setcap``` to be installed, it can be installed using the following:

 * apt: ```sudo apt-get install libcap2-bin```
 * yum: ```su -c \'yum install libcap2-bin\'```

### IMPORTANT!
You need to stop bluetoothd before running ble-ancs

```sh
sudo stop bluetooth
```

or

```sh
sudo /etc/init.d/bluetooth stop
```





Usage
-----

    var BleAncs = require('ble-ancs');

    var ancs = new BleAncs();

__Notification Events__

    ancs.on('notification', function(notification) {
        ...
    });

 * notification has the following properties
   * event (one of):
     * added
     * modified
     * removed
   * flags (array):
     * silent
     * important
   * category (one of):
     * other
     * incomingCall
     * missedCall
     * voicemail
     * schedule
     * email
     * other
     * news
     * healthAndFitness
     * businessAndFinance
     * location
     * entertianment
   * categoryCount
   * uid

__Operations for 'added' or 'modified' notifications (event property)__

Read App Identifier

    notification.readAppIdentifier(function(appIdentifier) {
      ...
    });

Read Title

    notification.readTitle(function(title) {
      ...
    });

Read Subtitle

    notification.readSubtitle(function(subtitle) {
      ...
    });

Read Message

    notification.readMessage(function(message) {
      ...
    });

Read Date

    notification.readDate(function(date) {
      ...
    });

Read All Attributes

    notification.readAttributes(function(attributes) {
      ...
    });

 * attributes has the following properties
   * appIdentifier
   * title
   * subtitle
   * message
   * date

## Useful Links

 * [Bluetooth Development Portal](http://developer.bluetooth.org)
   * [GATT Specifications](http://developer.bluetooth.org/gatt/Pages/default.aspx)
 * [Bluetooth: ATT and GATT](http://epx.com.br/artigos/bluetooth_gatt.php)

## License

Copyright (C) 2015 Sandeep Mistry <sandeep.mistry@gmail.com>
Copyright (C) 2015 Luke Berndt <luke@robotastic.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.