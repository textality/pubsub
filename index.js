const assert = require('useful-assert');
const isNode = require('detect-node');

var WebSocket;
var wss;
var ws;
var broker;
var client;
var testEvent = 'test_event';
var testUrl = 'ws://127.0.0.1:3777';
var testHost = '127.0.0.1';
var testPort = 3777;

function clientInit(url) {
    assert.any(assert.str.none, assert.undef, url);
    const Client = require('./client');
    function evHandler(ws, promiseHandler, data, event) {
        let removeListener = isNode ? ws.removeListener : ws.removeEventListener; 
        removeListener.call(ws, event, evHandler);
        promiseHandler(data);
    }
    url = url ? url : testUrl;
    return new Promise((resolve, reject) => {
        if (!ws) ws = new WebSocket(url);
        if (!client) client = new Client(ws);
        if (ws.readyState != ws.OPEN) {
            ws.addEventListener('error', e => evHandler(ws, reject, e, 'error'));
            ws.addEventListener('open', () => evHandler(ws, resolve, client, 'open'));
        } else {
            resolve(client);
        }
    });
}
function pubsub(action, event, url) {
    assert.true(action === 'pub' || action === 'sub');
    assert.any(assert.str.none, assert.undef, event);
    assert.any(assert.str.none, assert.undef, url);
    event = event ? event : testEvent;
    url = url ? url : testUrl;
    return new Promise((resolve, reject) => clientInit(url)
            .then(client => resolve(client[action](event)))
            .catch(reject));
}
function pub(event, url) {
    return pubsub('pub', event, url);
}
function sub(event, url) {
    return pubsub('sub', event, url);
}
if (isNode) {
    const Server =  require('ws').Server;
    WebSocket = require('ws');
    const Broker = require('./broker');

    function brokerInit(host, port) {
        assert.any(assert.str.none, assert.undef, host);
        assert.any(assert.num, assert.str.none, assert.undef, port);
        host = host ? host : testHost;
        port = port ? port : testPort;
        return new Promise((resolve, reject) => {
            if (!wss) {
                wss = Server({host: host, port: port});
                wss.on('listening', () => {
                    if (!broker) broker = new Broker(wss);
                    resolve(broker);
                });
                wss.on('error', reject);
            }
            if (wss._server.listening) {
                resolve(broker);
            } else {
                wss.on('listening', () => resolve(broker));
            }
        });
    };
    function both(host, port) {
        assert.any(assert.str.none, assert.undef, host);
        assert.any(assert.num, assert.str.none, assert.undef, port);
        return new Promise((resolve, reject) => {
            brokerInit(host, port)
                .then(broker => {
                    host = host ? host : testHost;
                    port = port ? port : testPort;
                    let url = `ws://${host}:${port}`;
                    clientInit(url)
                        .then(client => resolve({broker: broker, client: client}))
                        .catch(err => reject({broker: broker, error: err}));
                }).catch(reject);
        });
    }
    module.exports.both = both;
    module.exports.brokerInit = brokerInit;
}
module.exports.pub = pub;
module.exports.sub = sub;
