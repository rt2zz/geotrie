var through = require('through')
var shutup = require('shutup')
var sorthash = require('sortable-hash-mod')
var es = require('event-stream')

//@TODO make configurable
var geohashPrecision = 12
var geohashBase = 16

/*@TODO:improvements
Extra bit in first character to split longitudinal values in half or use first two characters for longitude
Map characters to deteministcally figure out neighbors without math
Use different bit count or adjust resolutions for extreme latitudes
*/

var geo = {
  encode: function(pos, opts){
    var opts = opts || {precision: geohashPrecision, base: geohashBase}
    return sorthash.encode([100*pos.lat/90, 100*pos.lon/180], opts)
  },
  decode: function(hash){
    var data = sorthash.decode(hash, {num: 2, base: geohashBase})
    return {lat: data[0]*90/100, lon: data[1]*180/100}
  },
  getNeighbor: function(key, pos, precision){
    //@TODO it should be possible to deterministically figure out the neighboring characters using a simple translation hash
    var lat = pos.lat
    var lon = pos.lon
    var pwidth = boxwidth(precision)
    if(key.indexOf('n') !== -1) lat = pos.lat + pwidth.lat
    if(key.indexOf('s') !== -1) lat = pos.lat - pwidth.lat
    if(key.indexOf('e') !== -1) lon = pos.lon + pwidth.lon
    if(key.indexOf('w') !== -1) lon = pos.lon - pwidth.lon
    return geo.encode({lat: lat, lon: lon}, {precision: precision, base: geohashBase})
  }
}

function boxwidth(precision){
  return {
    lat: 180/Math.pow(2, precision*2),
    lon: 360/Math.pow(2, precision*2)
  }
}

module.exports = GeoTrie
module.exports.geohash = geo

function GeoTrie (db) {
  if (!(this instanceof GeoTrie)) return new GeoTrie(db)
  this.db = db
}

function getKey (pos, ref){
  return geo.encode(pos)+'~'+ref
}

GeoTrie.prototype.add = function (pos, ref, fn) {
  var key = getKey(pos, ref)
  this.db.put(key, ' ', fn)
}

GeoTrie.prototype.remove = function (pos, ref, fn) {
  var key = getKey(pos, ref)
  this.db.del(pos, fn)
}

GeoTrie.prototype.purgeHashSpace = function (pos, fn) {
  var self = this

  var hash = getKey(pos)
  var rs = this.data.createReadStream({
    start: hash,
    end: hash + '~'
  })

  var removed = []
  rs.on('error', fn)
  res.on('data', remove)
  function remove (kv) {
    self.db.del(kv.key)
    removed.push(kv.key)
  }
  function end () {
    fn(null, removed)
  }
}

GeoTrie.prototype.createSearchStream = function (pos, opts) {
  if (!opts) opts = {}

  var hash = geo.encode(pos)

  var db = this.db
  var found = []
  var outer = shutup(through())

  //@TODO allow user to specify radius in meters and traslate to min/max resolution https://docs.google.com/spreadsheets/d/1IKnQVSg5xkwVQ8SBuznJhD2N9BkUxMOrC1qf-r5ppMU/edit#gid=0
  var hardLimit = typeof opts.hardLimit != 'undefined'? opts.hardLimit : Infinity
  var softLimit = typeof opts.softLimit != 'undefined'? opts.softLimit : Infinity
  var maxResolution = typeof opts.maxResolution != 'undefined'? opts.maxResolution : hash.length
  var minResolution = typeof opts.minResolution != 'undefined'? opts.minResolution : 0

  var resolution = maxResolution

  function read (resolution) {
    var key = hash.substr(0, resolution)
    var hashes = [key]
    var keystreams = []
    var innerEndCount = 0

    var centroid = geo.decode(key)
    var deltas = { lat: pos.lat - centroid.lat, lon: pos.lon - centroid.lon}
    var neighbors = []
    if(Math.abs(deltas.lat) > boxwidth(resolution).lat/2/2){
      neighbors.push(deltas.lat < 0 ? 's' : 'n')
    }
    if(Math.abs(deltas.lon) < boxwidth(resolution).lon/2/2){
      neighbors.push(deltas.lon < 0 ? 'w' : 'e')
      if(neighbors.length === 2) neighbors.push(neighbors[0]+neighbors[1])
    }
    neighbors.forEach(function(neighbor){
      hashes.push(geo.getNeighbor(neighbor, centroid, resolution))
    })

    //string up a key stream for each hash into the outer stream
    hashes.forEach(function(hash){
      var _opts = { gte: hash, lte: key+'~', values: false, old: false }
      var ks = db.createReadStream(_opts)
      keystreams.push(ks)
      var inner = through(write, end)

      function write (str) {
        if (found.indexOf(str) != -1) return
        found.push(str)
        inner.queue(str)
        if (found.length === hardLimit){
          end()
        }
      }

      function end () {
        innerEndCount++

        //if we have hit hard limit, destroy active streams and return
        if(found.length >= hardLimit){
          keystreams.forEach(function(keystream){ keystream.destroy() })
          outer.end()
          return
        }

        //otherwise do nothing until all resolution peer streams have finished
        if(innerEndCount === hashes.length){
          if(resolution === minResolution || found.length >= softLimit){
            outer.end()
          }
          else {
            resolution--
            read(resolution)
          }
        }
      }
      ks.pipe(inner).pipe(outer, { end: false })
      outer.on('end', ks.destroy.bind(ks))
    })
  }

  process.nextTick(function () {
    read(resolution)
  })

  return outer
}

var degreeToUnit = {
  degree: 1,
  //@TODO better way to approximate length per degree?
  meter: 111*1000
}

function computeDistance(pos1, pos2, type, unit){
  var unit = unit || 'meter'
  if(type !== 'euclidean') throw new Error('unsupported distance type')
  var x = pos1.lat - pos2.lat
  var y = (pos1.lon - pos2.lon)*Math.cos(pos1.lat*Math.PI/180)
  return degreeToUnit[unit]*Math.sqrt(x*x + y*y)
}

var _ = require('lodash')
GeoTrie.prototype.search = function(pos, opts){
  var keyToResult = through(function(key){
    var parts = key.split('~')
    var resultPos = geo.decode(parts[0])
    var result = {
      distance: computeDistance(pos, resultPos, 'euclidean'),
      pos: resultPos,
      ref: parts[1]
    }
    this.queue(result)
  })

  var resultStream = this.createSearchStream(pos, opts).pipe(keyToResult)
  resultStream.toArray = function(cb){
    resultStream.pipe(es.writeArray(function(err, results){
      var sorted = results.sort(function(a, b){
        if(a.distance < b.distance) return -1
        if(a.distance > b.distance) return 1
        return 0
      })
      cb(null, sorted)
    }))
  }

  return resultStream
}
