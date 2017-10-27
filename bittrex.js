//ActionCable init
var actionCable = require('es6-actioncable');
actionCable.consumer = actionCable.default.createConsumer('ws://127.0.0.1:3000/cable', { createWebsocket: (options) => {
  var w3cwebsocket = require('websocket').w3cwebsocket;
  let webSocket = new w3cwebsocket(
     'ws://127.0.0.1:3000/cable',
     options.protocols,
     'http://127.0.0.1:3000',
     options.headers,
     options.extraRequestOptions
   );
   return webSocket;
} });
actionCable.subscription = actionCable.consumer.subscriptions.create({channel: "BittrexChannel"});

//Bittrex init
const bittrex = require('node.bittrex.api');

//influxdb init
const Influx = require('influx');
const express = require('express');
const http = require('http');
const os = require('os');
const app = express();

const influx = new Influx.InfluxDB({
  host: 'localhost',
  database: 'markets',
  schema: [{
    measurement: 'bittrex',
    tags: ['market_name'],
    fields: {
      last: Influx.FieldType.FLOAT,
      bid: Influx.FieldType.FLOAT,
      ask: Influx.FieldType.FLOAT
    }
  }]
});

influx.getDatabaseNames()
  .then(names => {
    if (!names.includes('markets')) {
      console.log('Creating new Influx database.')
      return influx.createDatabase('markets');
    }
  })
  .then(() => {
    http.createServer(app).listen(3000, function () {
      console.log('InfluxDB http API listening on port 3000');
    })
  })
  .catch(err => {
    console.error(`Error creating Influx database!`);
  })

///////////////////////////////////////////////////////////////////

/*
// Subscribe to specific markets (can subscribe to all) - Gives ticker and summary info
bittrex.options({
  'verbose' : true,
});

bittrex.websockets.subscribe(['BTC-ETH','BTC-SC','BTC-DGB'], function(data, client) {
  if (data.M === 'updateExchangeState') {
    data.A.forEach(function(data_for) {
      console.log('Market Update for '+ data_for.MarketName, data_for);
    });
  }
});
*/

/* example response format below (JSON compliant)
{
   "data":[
      {
         "platform":"bittrex",
         "update_type":"summaryUpdate",
         "market_name":"BTC-ADT",
         "values":{
            "high":9.99,
            "low":8.91,
            "volume":1712933.285,
            "last":9.2,
            "base_volume":15.903,
            "timestamp":"2017-07-03T21:08:06.110Z",
            "bid":9.11,
            "ask":9.21,
            "open_buy_orders":232,
            "open_sell_orders":2496,
            "prev_day":9.75
         }
      }
   ]
}
*/

console.log('Connecting to Bittrex websocket...')
const bittrexWebsocketClient = bittrex.websockets.listen( function( data ) {
  if (data.M === 'updateSummaryState') {
    data.A.forEach(function(data_for) {
      data_for.Deltas.forEach(function(marketsDelta) {
        //console.log("Ticker update: " + JSON.stringify(marketsDelta));
        var response = {
          "platform":"bittrex",
          "update_type":"summaryUpdate",
          "market_name":marketsDelta.MarketName,
          "values":{
            'high':marketsDelta.High,
            'low':marketsDelta.Low,
            'volume':marketsDelta.Volume,
            'last':marketsDelta.Last,
            'base_volume':marketsDelta.BaseVolume,
            'timestamp':marketsDelta.TimeStamp,
            'bid':marketsDelta.Bid,
            'ask':marketsDelta.Ask,
            'open_buy_orders':marketsDelta.OpenBuyOrders,
            'open_sell_orders':marketsDelta.OpenSellOrders,
            'prev_day':marketsDelta.PrevDay,
            'change': (marketsDelta.Last/marketsDelta.PrevDay)*100-100
          }
        };
        //console.log("Response: " + JSON.stringify(response));

        //ActionCable broadcast
        actionCable.subscription.send(response);

        //Write data to influxDB
        influx.writePoints([
          {
            measurement: 'bittrex',
            tags: { market_name: marketsDelta.MarketName },
            fields: { last: marketsDelta.Last,
                      bid: marketsDelta.Bid,
                      ask: marketsDelta.Ask },
          }
        ]).catch(err => {
          console.error(`Error saving data to InfluxDB! ${err.stack}`)
        })
      });
    });
  }
});
