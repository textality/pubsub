const VError = require('verror');

module.exports = class Publisher {
    constructor(event, client) {
        this._client = client;
        this._sig = client._sig;
        this._event = event;
        this._errorHandlers = [];
    }
    get event() { return this._event; }
    _msg(action, data) {
        let tail = '';
        if (data) {
            if (typeof data != 'string')
                throw this._error('Publisher._msg: data must be a string!');
            tail = ':' + data;
        }
        return this._client._send(
                this._sig + action + ':' + this.event + tail);
    }
    _send(action, data) {
        this._client._send(this._msg(action, data));
    }
    send(data) {
        this._send('message', data);
    }
    pause() {
        this._send('pause');
    }
    unpub() {
        this._send('unpub');
        this._destroy();
    }
    _error(msg) {
        let opts = {name: 'PublisherError',
                    constructorOpt: this._error};
        return new VError(opts, msg);
    }
    onerror(handler) {
        if (typeof handler != 'function')
            throw this._error('onerror: handler must be a function!');
        this._errorHandlers.push(handler);
    }
    _handleError(err) {
        // call by Client instance
        for (let handler of this._errorHandlers) {
            handler(err);
        }
    }
};
