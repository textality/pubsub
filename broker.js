/*
 * <sig><action>:<event>:<data>
 * actions: 'pub', 'unpub', 'message', 'sub', 'unsub', 'pause'
 * broker action(only from broker to client): 'error', 'resume'
 */
module.exports = class Broker {
    constructor(wss) {
        this._wss = wss;
        this._sig = '_!&*#';
        this._actions = ['pub', 'unpub', 'message', 'sub', 'unsub', 'pause'];
        this._events = new Map();
        this._publishers = new WeakMap();
        this._setHandlers();
    }
    _setHandlers() {
        this._wss.on('connection', ws => {
            ws.on('message', msg => this._receiver(ws, msg));
            ws.on('close', (code, msg) => this._close(ws, 'conn close'));
            ws.on('error', error => this._close(ws, 'conn error'));
        });
        // set handlers for already exists connections
        for (let ws of this._wss.clients) {
            ws.on('message', msg => this._receiver(ws, msg));
            ws.on('close', (code, msg) => this._close(ws, 'conn close'));
            ws.on('error', error => this._close(ws, 'conn error'));
        }
    }
    _close(ws, cause) {
        this._ws = ws;
        let events = this._publishers.get(ws);
        if (events) {
            for (let event of events) {
                this._events.get(event).set('pause', true);
                this._events.get(event).delete('owner');
                //<sig><action><event><cause>
                let msg = this._sig + 'pause:' + event + ':' + cause;
                this._sendToSub(event, msg);
            }
            this._publishers.delete(ws);
        }
        delete this._ws;
    }
    _has(event) {
        return this._events.has(event);
    }
    _sendToSub(event, msg) {
        let sub = this._getSub(event);
        for (let ws of this.clients) {
            if (sub.has(ws)) ws.send(msg);
        }
    }
    _isOwner(owner, event) {
        // owner is ws connection object
        if (!this._has(event)) return false;
        return owner === this._events.get(event).get('owner');
    }
    get clients() {
        return this._wss.clients;
    }
    _getSub(event) {
        if (!this._has(event)) return new WeakSet();
        return this._events.get(event).get('sub');
    }
    _receiver(ws, msg) {
        this._ws = ws;
        this._msg = msg;
        let {action, event} = this._parse(msg);
        if (action) this._dispatch(action, event);
        delete this._ws;
        delete this._msg;
    }
    _dispatch(action, event) {
        if (action == 'pub') return this._pub(event);
        if (action == 'unpub') return this._unpub(event);
        if (action == 'message') return this._message(event);
        if (action == 'sub') return this._sub(event);
        if (action == 'unsub') return this._unsub(event);
        if (action == 'pause') return this._pause(event);
    }
    _pub(event) {
        if (this._has(event)) {
            if (this._events.get(event).get('owner')) {
                this._sendErr(`pub: event '${event}', already exists!`);
                return;
            } else {
                this._events.get(event).set('owner', this._ws);
                this._resume(event);
            }
        } else {
            // Map { 'sample.event' => Map { 'owner' => ws, 'sub' => WeakSet {} } }
            this._events.set(event, new Map([
                        ['pause', false],
                        ['owner', this._ws],
                        ['sub', new WeakSet()]
            ]));
        }
        if (this._publishers.has(this._ws)) {
            this._publishers.get(this._ws).push(event);
        } else {
            this._publishers.set(this._ws, [event]);
        }
    }
    _unpub(event) {
        if (!this._has(event)) {
            this._sendErr(`unpub: event '${event}', doesn't exists!`);
        } else if (!this._isOwner(this._ws, event)) {
            this._sendErr(`unpub: remove event '${event}', required owner permission!`);
        } else {
            let msg = this._sig + 'unpub:' + event;
            this._sendToSub(event, msg);
            this._events.delete(event);
            this._publishers.delete(this._ws);
        }
    }
    _message(event) {
        if (!this._has(event))
            return this._sendErr(`message: event '${event}', doesn't exists!`);
        if (this._events.get(event).get('pause'))
            this._events.get(event).set('pause', false);
        this._sendToSub(event, this._msg);
    }
    _sub(event) {
        if (!this._has(event)) {
            this._events.set(event, new Map(
                        [['pause', true], ['sub', new WeakSet()]]));
            this._ws.send(this._sig + 'pause:' + event);
        }
        this._events.get(event).get('sub').add(this._ws);
    }
    _unsub(event) {
        if (!this._has(event))
            return this._sendErr(`unsub: event '${event}', doesn't exists!`);
        this._events.get(event).get('sub').delete(this._ws);
    }
    _pause(event) {
        if (!this._has(event)) {
            this._sendErr(`pause: event '${event}', doesn't exists!`);
        } else if (this._isOwner(this._ws, event)) {
            this._events.get(event).set('pause', true);
            let msg = this._sig + 'pause:' + event;
            this._sendToSub(event, msg);
        } else {
            this._sendErr(`pause: pause event '${event}', required owner permission!`);
        }
    }
    _resume(event) {
        this._events.get(event).set('pause', false);
        let msg = this._sig + 'resume:' + event;
        this._sendToSub(event, msg);
    }
    _sendErr(msg) {
        this._ws.send(this._sig + 'error:' + msg);
    }
    _parse() {
        let err = 'parse: invalid message format! Received: ';
        if (!this._msg.startsWith(this._sig)) return {};
        let msg = this._msg.slice(this._sig.length);
        let action_end = msg.indexOf(':');
        if (action_end < 0) {
            this._sendErr(err + this._msg);
            return {};
        }
        let event_end = msg.indexOf(':', action_end + 1);
        if (event_end < 0) event_end = msg.length;
        let action = msg.slice(0, action_end);
        let event = msg.slice(action_end + 1, event_end);
        if (!(action && event)) {
            this._sendErr(err + this._msg);
            return {};
        }
        if (this._actions.indexOf(action) < 0) {
            this._sendErr(err + this.msg);
            return {};
        }
        return {action: action, event: event};
    }
};
