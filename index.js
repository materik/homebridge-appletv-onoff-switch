var appletv = require('node-appletv-x');

var Service, Characteristic;
module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-appletv-onoff-switch", "appletvswitch", AppleTVAccessory);
}

function AppleTVAccessory(log, config) {
    this.log = log;
    this.name = config.name;
    this.credentials = config.credentials;
    this.updateRate = config.pollingInterval || 300;
    this.retryRate = 2;
    this.skipCheck = false;
    this.debug = config.debug;

    this.services = [];

    this.atvService = new Service.Switch(this.name);
    this.atvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
    this.atvService
        .getCharacteristic(Characteristic.On)
        .on('set', this.setPowerState.bind(this))
        .on('get', this.getPowerState.bind(this));

    this.services.push(this.atvService);

    this.atvConnect();
}

AppleTVAccessory.prototype.getServices = function () {
    this.informationService = new Service.AccessoryInformation();
    this.informationService
        .setCharacteristic(Characteristic.Manufacturer, "Apple")
        .setCharacteristic(Characteristic.Model, "Apple TV")
        .setCharacteristic(Characteristic.SerialNumber, "ST7FZN1NSXG6")
    this.services.push(this.informationService);
    return this.services;
}

AppleTVAccessory.prototype.atvConnect = function () {
    var that = this;
    var credentials = appletv.parseCredentials(this.credentials);
    appletv.scan(credentials.uniqueIdentifier)
        .then(function (devices) {
            that.device = devices[0];
            that.device.on('error', function (error) {
                that.log("ERROR: " + error.message);
                that.log("ERROR Code: " + error.code);
                setTimeout(function () {
                    that.log("Trying to reconnect to AppleTV: " + that.name);
                    that.atvConnect();
                }, that.retryRate * 1000);
            });
            return that.device.openConnection(credentials);
        })
        .then(function (device) {
            that.log("Connected to AppleTV: " + that.name);
            that.updateStatus();
        })
        .catch(function (error) {
            that.log("ERROR: " + error.message);
            that.log("ERROR Code: " + error.code);
            setTimeout(function () {
                that.log("Trying to reconnect to AppleTV: " + that.name);
                that.atvConnect();
            }, that.retryRate * 1000);
        });
}

AppleTVAccessory.prototype.updateStatus = function () {
    var that = this;
    setTimeout(function () {
        if(!that.skipCheck) {
            that.checkATVStatus();
            that.updateStatus();
        } else {
            that.skipCheck = false;
            that.updateStatus();
        }
    }, this.updateRate * 1000);
}

AppleTVAccessory.prototype.checkATVStatus = function () {
    var that = this;

    that.device.sendIntroduction().then(function (deviceInfo) {
        if (that.debug === true) {
          that.log(JSON.stringify(deviceInfo, null, '  '));
        }

        var payload = deviceInfo.payload

        // If the Apple TV is not a proxy for AirPlay playback, the logicalDeviceCount determines the state
        if (payload.logicalDeviceCount > 0 && !payload.isProxyGroupPlayer) {
            that.updatePowerState(true);
        // If the Apple TV is a proxy for AirPlay playback, the logicalDeviceCount and the AirPlay state determine the state
        } else if (payload.logicalDeviceCount > 0 && payload.isProxyGroupPlayer && payload.isAirplayActive) {
            that.updatePowerState(true);
        } else if (payload.logicalDeviceCount == 0) {
            that.updatePowerState(false);
        }
    })
    .catch(function (error) {
        that.log("ERROR: " + error.message);
        that.log("ERROR Code: " + error.code);
        setTimeout(function () {
            that.log("Trying to reconnect to AppleTV: " + that.name);
            that.atvConnect();
        }, that.retryRate * 1000);
    });
}

AppleTVAccessory.prototype.getPowerState = function (callback) {
    callback(null, this.atvService.getCharacteristic(Characteristic.On).value);
}

AppleTVAccessory.prototype.updatePowerState = function (state) {
    if (this.atvService.getCharacteristic(Characteristic.On).value != state) {
        this.atvService.getCharacteristic(Characteristic.On).updateValue(state);
    }
}

AppleTVAccessory.prototype.setPowerState = function (state, callback) {
    var that = this;

    if(this.atvService.getCharacteristic(Characteristic.On).value != state) {
        if (state) {
            that.device.sendKeyCommand(appletv.AppleTV.Key.Tv).then(function () {
                that.log(that.name + " is turned on");
                that.updatePowerState(state);
                that.getPowerState(callback);
                that.skipCheck = true;
            }).catch(function (error) {
                that.log("ERROR: " + error.message);
                that.log("ERROR Code: " + error.code);
                setTimeout(function () {
                    that.log("Trying to reconnect to AppleTV: " + that.name);
                    that.atvConnect();
                }, that.retryRate * 1000);
            });
        } else {
            that.device.sendKeyCommand(appletv.AppleTV.Key.Suspend).then(function () {
                that.log(that.name + " is turned off");
                that.updatePowerState(state);
                that.getPowerState(callback);
                that.skipCheck = true;
            }).catch(function (error) {
                that.log("ERROR: " + error.message);
                that.log("ERROR Code: " + error.code);
                setTimeout(function () {
                    that.log("Trying to reconnect to AppleTV: " + that.name);
                    that.atvConnect();
                }, that.retryRate * 1000);
            });
        }
    } else {
        that.getPowerState(callback);
    }
}

