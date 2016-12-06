const VError = require('verror');
const Publisher = require('./publisher');
const Subscriber = require('./subscriber');

module.exports = class Client {
    constructor(ws) {
        this._ws = ws;
        this._sig = '_!&*#';
        this._pause = new Set();
        this._msg = null;
        this._data = null;
        this._actions = ['unpub', 'message', 'pause', 'resume'];
        this._events = new Map();
        this._errorHandlers = [];
        this._setHandlers();
    }
    _connectionError(msg, err) {
        let opts = {name: 'ConnectionError',
                    constructorOpt: this._connectionError};
        console.log('_connectionError err:', err);
        if (err) opts.cause = err;
        return new VError(opts, msg);
    }
    _error(msg) {
        let opts = {name: 'ClientError',
                    constructorOpt: this._error};
        return new VError(opts, msg);
    }
    _brokerError(msg) {
        let opts = {name: 'BrokerError',
                    constructorOpt: this._brokerError};
        return new VError(opts, msg);
    }
    onerror(handler) {
        if (typeof handler != 'function')
            throw this._error('Client.onerror: handler must be a function!');
        this._errorHandlers.push(handler);
    }
    get _send() {
        return this._ws.send.bind(this._ws);
    }
    _setHandlers() {
        this._ws.addEventListener('message', ev => this._receiver(ev.data));
        this._ws.addEventListener('close', this._conError.bind(this, 'close'));
        this._ws.addEventListener('error', this._conError.bind(this, 'error'));
    }
    _pauseAll(cause) {
        for (let [ev, subscriber] of this._events) {
            this._pause.add(ev);
            for (let handler of subscriber['pause']) {
                handler(cause, ev, 'pause');
            }
        }
    }
    _conError(type, err) {
        if (type == 'close') {
            var msg = 'Client connection was closed.';
        } else if (type == 'error') {
            msg = 'Client connection error.';
        } else {
            throw this._error('Client._conClose: type must be a one ' +
                              'of "close" or "error"!');
        }
        this._pauseAll(msg);
        err = this._connectionError(msg, err);
        for (let handler of this._errorHandlers) {
            handler(err, this);
        }
    }
    _parse(msg) {
        if (!msg.startsWith(this._sig)) return {};
        msg = msg.slice(this._sig.length);
        let action_end = msg.indexOf(':');
        if (action_end < 0) return {};
        let action = msg.slice(0, action_end);
        if (action == 'error')
            return {action: 'error', data: msg.slice(action_end + 1)};
        let event_end = msg.indexOf(':', action_end + 1);
        if (event_end < 0) event_end = msg.length;
        let event = msg.slice(action_end + 1, event_end);
        if (!(action && event)) return {};
        if (this._actions.indexOf(action) < 0) return {};
        let data = msg.slice(event_end + 1);
        return {action: action, event: event, data: data};
    } 
    _receiver(msg) {
        let {action, event, data} = this._parse(msg);
        if (!action) return;
        if (action == 'error') {
            let err = this._brokerError(data);
            for (let handler of this._errorHandlers) {
                handler(err, this);
            }
            for (let pub of this._events.values()) {
                pub._handleError(err);
            }
            return;
        }
        if (!this._has(event)) return;
        this._msg = msg;
        this._data = data;
        this._dispatch(action, event);
        this._msg = null;
        this._data = null;
    }
    _dispatch(action, event) {
        if (action == 'message') {
            var status = this._pause.delete(event);
            if (status) this._handleEvent('resume', event);
            this._handleEvent('message', event);
        } else if (action == 'unpub') {
            this._handleEvent('unpub', event);
            this._events.delete(event);
        } else if (action == 'pause') {
            this._pause.add(event);
            this._handleEvent('pause', event);
        } else if (action == 'resume') {
            this._pause.delete(event);
            this._handleEvent('resume', event);
        }
    }
    _getHandlers(event, action) {
        return this._events.get(event)[action + 'Handlers'];
    }
    _handleEvent(action, event) {
        for (let handler of this._getHandlers(event, action)) {
            handler(this._data, event, action);
        }
    }
    sub(event) {
        if (!this._has(event)) this._events.set(event, new Subscriber(event, this)); 
        return this._events.get(event);
    }
    pub(event) {
        this._ws.send(this._sig + 'pub:' + event);
        return new Publisher(event, this);
    }
    _has(event) {
        return this._events.get(event);
    }
};
