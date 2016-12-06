const VError = require('verror');

module.exports = class Subscriber {
    constructor(event, client) {
        this._event = event;
        this._client = client;
        this._sig = client._sig;
        this._subscribed = false;
        this._events = ['message', 'unpub', 'pause', 'resume'];
        this._messageHandlers = [];
        this._unpubHandlers = [];
        this._pauseHandlers = [];
        this._resumeHandlers = [];
    }
    get event() { return this._event; }
    get messageHandlers() { return this._messageHandlers; }
    onmessage(handler) { return this.addEventListener('message', handler); }
    get unpubHandlers() { return this._unpubHandlers; }
    onunpub(handler) { return this.addEventListener('unpub', handler); }
    get pauseHandlers() { return this._pauseHandlers; }
    onpause(handler) { return this.addEventListener('pause', handler); }
    get resumeHandlers() { return this._resumeHandlers; }
    onresume(handler) { return this.addEventListener('resume', handler); }
    addEventListener(event, handler) {
        if (this._events.indexOf(event) == -1)
            throw this._error('addEventListener: event must be one of event names!');
        if (typeof handler != 'function')
            throw this._error('addEventListener: handler must be a function!');
        this['_' + event + 'Handlers'].push(handler);
        if (!this._subscribed) {
            this._subscribed = true;
            this._client._send(this._sig + 'sub:' + this._event);
        }
        return this;
    }
    removeEventListener(event, handler) {
        if (this._events.indexOf(event) == -1)
            throw this._error('removeEventListener: event must be one of event names!');
        if (typeof handler != 'function')
            throw this._error('removeEventListener: handler must be a function!');
        let handlers = this['_' + event + 'Handlers'];
        let index = handlers.indexOf(handler);
        while (index > -1) {
            handlers.splice(index, 1);
            index = handlers.indexOf(handler);
        }
    }
    unsub() {
        this._client._events.delete(this._event);
        this.subscribed = false;
        this._messageHandlers = [];
        this._unpubHandlers = [];
        this._pauseHandlers = [];
        this._resumeHandlers = [];
        this._client._send(this._sig + 'unsub:' + this._event);
    }
    _error(msg) {
        let opts = {name: 'SubscriberError',
                    constructorOpt: this._error};
        return new VError(opts, msg);
    }
};
