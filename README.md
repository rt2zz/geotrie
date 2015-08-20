#level-geotrie
Store and search geo data.  Geohashes latitude/longitude coordinates and stores them in a leveldb instance.  Uses the lexographical sorting of leveldb to provide a trie like data structure and efficient search algorithm.

Heavily borrowed from / inspired by [level-trie](https://github.com/juliangruber/level-trie) and [level-places](https://github.com/Wayla/level-places).  Thanks to Julian Gruber.

##Usage
```js
var level = require('level')
var GeoTrie = require('level-geotrie')
var geotrie = geotrie(level(__dirname + '/db'))

geotrie.add({lat: 1, lon: 1}, 'SomeReferenceString')
geotrie.add({lat: 1.01, lon: 1}, 'OtherReferenceString')

geotrie.search({lat: 1, lon: 1}).toArray(function(err, results){
  //...
})
```
Results will come in the form of
```js
{
  distance: 10, //in meters
  pos: {lat: 1, lon 1}, //stored position (will not be exact because of geohashing fidelity loss)
  ref: 'your string' //the reference string supplied during .add
}
```
Search Options
###hardLimit (Int)
If supplied the search will immediately return after reaching this number of results (setting hard limit may result in omitted results that are closer to the centroid than other returned results)
###softLimit (Int)
Usually a better option to setting hardLimit - If hit, the search will finish streaming after it completes it's current resolution level
###maxResolution (int)
Defaults to 12.  The search will start from the max resolution.  If your relevant results will always be far apart then you can set this number lower for small efficiency gains
###minResolution (int)
Defaults to 0.  The search will end at this resolution even if the hard/soft limits have not been met.  

##Notes
Unfortunately geohash's are roughly rectangular in shape (and generally not square).  If using a 2^(odd) base odd precision hash boxes will be square - all other hash boxes are about twice as big in the longitudinal direction at the equator (it reverses as you travel to extreme latitudes where longitudinal distances pinch).

##Geohash Precision
Assuming base16 geohashing (4 bits per character) the hash precision will be as follows:

Precision | Lat Error | Lon Error
---|---|---
2 | 1248.75 km | 2497.5 km
4 | 78.046875 km | 156.09375 km
6 | 4.8779296875 km | 9.755859375 km
8 | 304.870605469 m | 609.741210938 m
10 | 19.0544128418 m | 38.1088256836 m
12 | 1.19090080261 m | 2.38180160522 m
