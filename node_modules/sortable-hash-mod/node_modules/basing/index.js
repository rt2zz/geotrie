var basing = function(string, base){
  var int = parseInt(string, base)
  return {
    int: int,
    to: function(radix){
      return int.toString(radix)
    }
  }
}

basing.dict = {
  2: {
    chars: '01',
    bits: [1]
  },
  4: {
    chars: '0123',
    bits: [2, 1]
  },
  8: {
    chars: '01234567',
    bits: [4, 2, 1]
  },
  16: {
    chars: '0123456789abcdef',
    bits: [8, 4, 2, 1]
  },
  32: {
    chars: '0123456789abcdefghjkmnpqrtuvwxyz',
    bits: [16, 8, 4, 2, 1]
  },
  geo32: {
    chars: '0123456789bcdefghjkmnpqrstuvwxyz',
    bits: [16, 8, 4, 2, 1]
  },
  64: {
    chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    bits: [32, 16, 8, 4, 2, 1]
  },
  base64URL: {
    chars: '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz',
    bits: [32, 16, 8, 4, 2, 1]
  }
}

module.exports = basing
