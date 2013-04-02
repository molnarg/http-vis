(function(){var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var cached = require.cache[resolved];
    var res = cached? cached.exports : mod();
    return res;
};

require.paths = [];
require.modules = {};
require.cache = {};
require.extensions = [".js",".coffee",".json"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            x = path.normalize(x);
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = path.normalize(x + '/package.json');
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key);
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

(function () {
    var process = {};
    var global = typeof window !== 'undefined' ? window : {};
    var definedProcess = false;
    
    require.define = function (filename, fn) {
        if (!definedProcess && require.modules.__browserify_process) {
            process = require.modules.__browserify_process();
            definedProcess = true;
        }
        
        var dirname = require._core[filename]
            ? ''
            : require.modules.path().dirname(filename)
        ;
        
        var require_ = function (file) {
            var requiredModule = require(file, dirname);
            var cached = require.cache[require.resolve(file, dirname)];

            if (cached && cached.parent === null) {
                cached.parent = module_;
            }

            return requiredModule;
        };
        require_.resolve = function (name) {
            return require.resolve(name, dirname);
        };
        require_.modules = require.modules;
        require_.define = require.define;
        require_.cache = require.cache;
        var module_ = {
            id : filename,
            filename: filename,
            exports : {},
            loaded : false,
            parent: null
        };
        
        require.modules[filename] = function () {
            require.cache[filename] = module_;
            fn.call(
                module_.exports,
                require_,
                module_,
                module_.exports,
                dirname,
                filename,
                process,
                global
            );
            module_.loaded = true;
            return module_.exports;
        };
    };
})();


require.define("path",function(require,module,exports,__dirname,__filename,process,global){function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

});

require.define("__browserify_process",function(require,module,exports,__dirname,__filename,process,global){var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
        && window.setImmediate;
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    if (name === 'evals') return (require)('vm')
    else throw new Error('No such module. (Possibly not yet loaded)')
};

(function () {
    var cwd = '/';
    var path;
    process.cwd = function () { return cwd };
    process.chdir = function (dir) {
        if (!path) path = require('path');
        cwd = path.resolve(dir, cwd);
    };
})();

});

require.define("/lib/Packet.js",function(require,module,exports,__dirname,__filename,process,global){var protocols = require('./tables/protocols')
  , views = require('./views')
  , bt = require('bt')
  , Template = bt.Template
  , View = bt.View

View.prototype.toString = function() { return '?' }

var Packet = module.exports = Template.extend({
  payload: {
    get: function getPayload() {
      var ViewClass = views[protocols[this.payload_protocol]]

      return ViewClass ? (new ViewClass(this, this.__offset_payload_view, this.__max_size_payload_view)) : (this.payload_view)
    },
    set: function setPayload(value) {
      this.payload_protocol = value.protocol
      var payload = this.payload
      if (payload.set) payload.set(value)
    },
    enumerable: true
  },

  payload_view: {
    get: function getPayloadView() {
      return new Template(this)
    }
  },

  protocols: {
    get: function getProtocols() {
      var protocols = []
        , view = this

      while (view) {
        protocols.push(view.protocol)
        view = view.payload
      }

      return protocols
    },
    enumerable: true
  },

  toString: { value: function toString() {
    var payload = this.payload

    if (this.protocol) {
      // This is a concrete protocol but there's no toString() implementation
      return this.protocol.toUpperCase() + (payload ? (' | ' + payload.toString()) : '')

    } else {
      // This is a generic packet
      return payload && payload.toString()
    }
  }}
})

var protocol_properties = {}

Object.keys(protocols).forEach(function(protocol_name) {
  protocol_properties[protocol_name] = {
    get: function getConcreteProtocol() {
      // This is the root protocol
      if (this.protocol === protocol_name) return this

      // If there's no defined payload protocol, then interpret the payload as protocol_name and return it
      if (!this.payload_protocol) return new views[protocols[protocol_name]](this, this.payload_view.offset)

      // This is not the root protocol, so stepping through the payload chain
      var view = this

      // Go until the end of the chain or to the appropriate protocol
      while (!(view === undefined || view.protocol === protocol_name)) {
        view = view.payload
      }

      return view
    },

    set: function setConcreteProtocol(value) {
      var view = this

      while (!(view.payload_protocol === undefined || view.payload_protocol === protocol_name)) {
        view = view.payload
      }

      value.protocol = protocol_name
      view.payload = value
    }
  }
})

Object.defineProperties(Packet.prototype, protocol_properties)

});

require.define("/lib/tables/protocols.js",function(require,module,exports,__dirname,__filename,process,global){// protocol id -> view name
module.exports = {
  ethernet: 'EthernetFrame',
  ipv4    : 'IPv4Packet',
  tcp     : 'TCPSegment',
  udp     : 'UDPDatagram',
  arp     : 'ARPPacket',
  pcap    : 'PcapRecord',
  dns     : 'DNSPacket',
  icmp    : 'ICMPPacket',
  linux_cooked: 'LinuxCookedPacket'
}

});

require.define("/lib/views.js",function(require,module,exports,__dirname,__filename,process,global){var bt = require('bt')

var viewlist =
  [ 'ARPPacket'
  , 'EthernetFrame'
  , 'IPv4Packet'
  , 'IPv4Address'
  , 'MACAddress'
  , 'TCPSegment'
  , 'UDPDatagram'
  , 'Text'
  , 'PcapRecord'
  , 'DNSPacket'
  , 'DomainName'
  , 'PcapFile'
  , 'ICMPPacket'
  , 'LinuxCookedPacket'
  ]

var view_properties = {
  View     : { value: bt.View },
  Template : { value: bt.Template },
  List     : { value: bt.List }
}

viewlist.forEach(function(name) {
  view_properties[name] = { configurable: true, get: function() {
    var View = require('./views/' + name)

    // Once loaded, define it as a simple value property. The next access will be much faster.
    Object.defineProperty(this, name, { value: View })

    return View
  }}
})

module.exports = Object.create(Object.prototype, view_properties)
});

require.define("/node_modules/bt/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./bt"}
});

require.define("/node_modules/bt/bt.js",function(require,module,exports,__dirname,__filename,process,global){;(function (root, factory) {
  if (typeof exports === 'object') {
    module.exports = factory()

  } else if (typeof define === 'function' && define.amd) {
    define(factory)

  } else {
    root.bt = factory()
  }

}(this, function () {
  'use strict'

  function View(parent, byteOffset, byteLength) {
    this.parent = parent
    this.buffer = parent.buffer || parent // Inheriting buffer from parent (View, DataView, etc.), or parent is the buffer
    this.byteOffset = (parent.byteOffset || 0) + (byteOffset || 0)
    this.byteLength = byteLength || (parent.byteLength || parent.length) - (byteOffset || 0)

    // Since inheritance is not possible, we store a dataview instance instead
    this.dataview = parent.dataview || new DataView(this.buffer instanceof View ? new ArrayBuffer(0) : this.buffer)
  }

  // Bitmasks with j leading 1s
  var ones = []
  for (var j = 1; j <= 32; j++) ones[j] = (1 << j) - 1

  Object.defineProperties(View.prototype, {
    getUint: { value: function getUint(bit_length, offset, little_endian) {
      offset += this.byteOffset

      // Shortcut for built-in read methods
      if (offset % 1 === 0) {
        switch(bit_length) {
          case 8 : return this.dataview.getUint8 (offset, little_endian)
          case 16: return this.dataview.getUint16(offset, little_endian)
          case 32: return this.dataview.getUint32(offset, little_endian)
        }
      }

      var byte_offset = Math.floor(offset)
        , bit_offset = (offset % 1) * 8
        , back_offset = 32 - bit_length - bit_offset

      if (back_offset < 0) {
        var overflow = -back_offset
        return (this.getUint(bit_length - overflow, offset) << overflow) +
               (this.getUint(overflow, byte_offset + 4))

      } else {
        return (this.dataview.getUint32(byte_offset) >> back_offset) & ones[bit_length]
      }
    }},

    setUint: { value: function setUint(bit_length, offset, value, little_endian) {
      offset += this.byteOffset

      // Shortcut for built-in write methods
      if (offset % 1 === 0) {
        switch(bit_length) {
          case 8 : return this.dataview.setUint8 (offset, value, little_endian)
          case 16: return this.dataview.setUint16(offset, value, little_endian)
          case 32: return this.dataview.setUint32(offset, value, little_endian)
        }
      }

      var byte_offset = Math.floor(offset)
        , bit_offset = (offset % 1) * 8
        , back_offset = 32 - bit_length - bit_offset

      if (back_offset < 0) {
        var overflow = -back_offset
        this.setUint(bit_length - overflow, offset, value >> overflow)
        this.setUint(overflow, byte_offset + 4, value & ones[overflow])

      } else {
        var one_mask = value << back_offset
          , zero_mask = one_mask | ones[back_offset] | (ones[bit_offset] << bit_length + back_offset)
        this.dataview.setUint32(byte_offset, this.dataview.getUint32(byte_offset) & zero_mask | one_mask)
      }
    }}
  })

  function declareAccessorFunctions(bit_length) {
    View.prototype['getUint' + bit_length] = function(offset, little_endian) {
      return this.getUint(bit_length, offset, little_endian)
    }

    View.prototype['setUint' + bit_length] = function(offset, value, little_endian) {
      this.setUint(bit_length, offset, value, little_endian)
    }
  }

  for (var length = 1; length <= 32; length++) declareAccessorFunctions(length)


  var known_exceptions = ['TypeError', 'ReferenceError', 'RangeError', 'INDEX_SIZE_ERR', 'IndexSizeError']

  // Return null if runtime property, and the constant value otherwise
  function propertyExpression(object, name, expression) {
    if (!expression) return undefined

    var descriptor
    if (typeof expression === 'string') {
      // anonymous function-like string
      descriptor = { get: new Function('return ' + expression) }

      if (expression.match(/^[0-9a-zA-Z_$.]*$/)) {
        // it is a reference to a property, so it is possible to generate a setter as well
        descriptor.set = new Function('value', expression + ' = value')
      }

    } else if (typeof expression === 'number' || typeof expression === 'boolean') {
      // explicitly given number
      descriptor = { value: expression }

    } else if (expression instanceof Function) {
      var properties = Object.getOwnPropertyNames(expression.prototype)
      if (properties.length === 1 && properties[0] === 'constructor') {
        // expression is an anonymous function that returns the class
        descriptor = { get: expression }

      } else {
        // expression is a constructor function
        descriptor = { value: expression }
      }

    } else {
      throw new Error('Unrecognized expression for ' + name + ': ' + JSON.stringify(expression))
    }

    // Simplifying if possible (if there's no reference error)
    if (descriptor.get) {
      try {
        descriptor = { value: descriptor.get.call(Object.create(object)) }
      } catch(e) {
        if (known_exceptions.indexOf(e.name) === -1) throw e
      }
    }

    descriptor.configurable = true

    Object.defineProperty(object, name, descriptor)

    return ('value' in descriptor) ? descriptor.value : null
  }

  function Template(parent, byteOffset, byteLength) {
    View.call(this, parent, byteOffset, byteLength)
  }

  Template.prototype = Object.create(View.prototype, {
    __size_undefined: { value: 0 },
    __offset_undefined: { value: 0 },

    size: { get: function getSize() {
      return (this['__offset_' + this.__last] + this['__size_' + this.__last]) || this.byteLength
    }},

    inline_size: { value: function() {
      propertyExpression(this, 'size', '(this.__offset_' + this.__last + ' + this.__size_' + this.__last + ') || this.byteLength')
    }},

    valueOf: { value: function valueOf() {
      var size = this.size
      return (size <= 4) ? this.getUint(size * 8, 0) : undefined
    }},

    set: { value: function set(values) {
      if (typeof values === 'object') {
        for (var key in values) {
          this[key] = values[key]
        }

      } else if (typeof values === 'number' && this.size <= 4) {
        this.setUint(this.size * 8, 0, values)
      }
    }},

    data: { get: function getData() {
      if (this.buffer instanceof ArrayBuffer) {
        return new DataView(this.buffer, this.byteOffset, this.size)
      } else {
        return this.buffer.slice(this.byteOffset, this.size)
      }
    }}
  })

  Template.defineProperty = function(object, name, desc) {
    if (desc instanceof Array) {
      defineBranches(object, name, desc)

    } else if (typeof desc === 'function' || (typeof desc === 'object' && desc.view instanceof Function)) {
      defineTypedProperty(object, name, desc)

    } else if (typeof desc === 'number' || 'size' in desc || 'offset' in desc) {
      defineBitfieldProperty(object, name, desc)

    } else if ('array' in desc) {
      if (!desc.__view) desc.__view = List.extend(desc)
      defineTypedProperty(object, name, desc.__view)

    } else if ('value' in desc || 'get' in desc || 'set' in desc) {
      Object.defineProperty(object, name, desc)

    } else {
      if (!desc.__view) desc.__view = Template.extend(desc)
      defineTypedProperty(object, name, desc.__view)
    }
  }

  Template.defineProperties = function(object, properties) {
    var names = properties._order || Object.keys(properties)

    for (var i = 0; i < names.length; i++) {
      Template.defineProperty(object, names[i], properties[names[i]])
    }
  }

  Template.create = function(prototype, descriptor) {
    var structure = Object.create(prototype)

    Template.defineProperties(structure, descriptor)
    structure.inline_size()

    return structure
  }

  Template.extend = function(structure) {
    var ParentClass = this

    var TemplateClass = structure.init || function TemplateClass(parent, byteOffset, byteLength) {
      ParentClass.call(this, parent, byteOffset, byteLength)
    }
    delete structure.init

    TemplateClass.structure = structure
    TemplateClass.extend = Template.extend

    TemplateClass.prototype = Template.create(ParentClass.prototype, structure)

    return TemplateClass
  }

  function wrapWithClosure(source, closure) {
    var closure_keys = Object.keys(closure)
      , closure_arguments = closure_keys.map(function(key) { return closure[key] })

    return Function.apply(null, closure_keys.concat('return ' + source)).apply(null, closure_arguments)
  }

  function defineBitfieldProperty(object, name, desc) {
    if (!(desc instanceof Object)) desc = { size: desc }

    var offset_prop = '__offset_' + name
      , size_prop = '__size_' + name
      , le_prop = '__le_' + name

      , prev_offset = '__offset_' + object.__last
      , prev_size = '__size_' + object.__last

      , offset = propertyExpression(object, offset_prop, desc.offset || function() { return this[prev_offset] + this[prev_size] })
      , size   = propertyExpression(object, size_prop  , desc.size)
      , le     = propertyExpression(object, le_prop    , desc.little_endian)

      , rounded = (size === 1 || size === 2 || size === 4)

    // Getter
    var getter_name = 'get_' + name
      , getter_closure = {}
      , getter_src = 'var value = ' +
        (rounded ? 'this.dataview.getUint{size}(this.byteOffset + {offset}, {le});'  // Directly accessing the root buffer
                 : 'this.getUint({size}, {offset}, {le});'                        // Indirect access, irregular field size
        )
        .replace('{offset}', offset === null ? ('this.' + offset_prop       ) : offset)
        .replace('{size}'  , size   === null ? ('this.' + size_prop + ' * 8') : size * 8)
        .replace('{le}'    , le     === null ? ('this.' + le_prop           ) : le)

    if (desc.domain) {
      getter_src += 'if (value in domain) value = domain[value];'
      getter_closure.domain = desc.domain

    } else if (desc.size === 1/8) {
      getter_src += 'value = Boolean(value);'
    }

    if (desc.assert) {
      getter_closure.assert = desc.assert
      getter_src += 'assert.call(this, value);'
    }

    var getter = wrapWithClosure('function ' + getter_name + '() { ' + getter_src + ' return value; }', getter_closure)


    // Setter
    var setter_name = 'set_' + name
      , setter_closure = {}
      , setter_src =
        (rounded ? 'this.dataview.setUint{size}(this.byteOffset + {offset}, value, {le});' // Directly accessing the root buffer
                 : 'this.setUint({size}, {offset}, value, {le});'                       // Indirect access, irregular field size
        )
        .replace('{offset}', offset === null ? ('this.' + offset_prop       ) : offset)
        .replace('{size}'  , size   === null ? ('this.' + size_prop + ' * 8') : size * 8)
        .replace('{le}'    , le     === null ? ('this.' + le_prop           ) : le)

    if (desc.assert) {
      setter_closure.assert = desc.assert
      setter_src = 'assert.call(this, value);' + setter_src
    }

    if (desc.domain) {
      setter_closure.reverse_domain = {}
      for (var n in desc.domain) setter_closure.reverse_domain[desc.domain[n]] = Number(n)
      setter_src = 'if (value in reverse_domain) value = reverse_domain[value];' + setter_src

    } else if (desc.size === 1/8) {
      setter_src = 'value = value ? 1 : 0;' + setter_src
    }

    var setter = wrapWithClosure('function ' + setter_name + '(value) { ' + setter_src + ' }', setter_closure)

    // Defining the property
    Object.defineProperty(object, name, { get: getter, set: setter, enumerable: true })

    object.__last = name
  }

  function defineTypedProperty(object, name, desc) {
    if (typeof desc === 'function') desc = { view: desc }

    var offset = '__offset_' + name, size = '__size_' + name, max_size = '__max_size_' + name, type = '__type_' + name
      , prev_offset = '__offset_' + object.__last, prev_size = '__size_' + object.__last

    var buildtime_offset   = propertyExpression(object, offset, desc.offset || function() { return this[prev_offset] + this[prev_size] })
    var buildtime_view     = propertyExpression(object, type, desc.view)
    var buildtime_max_size = propertyExpression(object, max_size, desc.size)

    var getter_name = 'get_' + name
      , getter_closure = { Class: buildtime_view }
      , getter_src = 'return new {Class}(this, {offset}, {max_size})'
        .replace('{Class}'   , buildtime_view === null     ? ('this.' + type)     : 'Class')
        .replace('{offset}'  , buildtime_offset === null   ? ('this.' + offset)   : buildtime_offset)
        .replace('{max_size}', buildtime_max_size === null ? ('this.' + max_size) : buildtime_max_size)
      , getter = wrapWithClosure('function ' + getter_name + '() { ' + getter_src + ' }', getter_closure)

    var setter = new Function('value', 'var object = this.' + name + '\n if (object.set) object.set(value)')

    Object.defineProperty(object, name, { get: getter, set: setter })

    try {
      var prototype_size = Object.create(buildtime_view.prototype).size
    } catch (e) {
      // There's no buildtime information about the type, or it has no buildtime length property
    }
    propertyExpression(object, size, desc.size || prototype_size || function() { return this[name].size })

    object.__last = name
  }

  function defineBranches(object, name, branches) {
    var previous = object.__last
      , branchname = '__branch_' + name + '_'
      , conditions = []
      , proxy_properties = {}

    var offset = '__offset_' + name, size = '__size_' + name
      , prev_offset = '__offset_' + previous, prev_size = '__size_' + previous

    function activeBranches() {
      var active = []

      outer_loop: for (var i = 0; i < conditions.length; i++) {
        var condition = conditions[i]
        for (var key in condition) if (this[key] !== condition[key]) continue outer_loop
        active.push(i)
      }

      return active
    }

    function activate(branch) {
      var condition = conditions[branch]
      for (var key in condition) this[key] = condition[key]
    }

    // Branch properties
    branches.forEach(function(branch, index) {
      var condition = {}, first, last
      object.__last = previous

      for (var key in branch) {
        var descriptor = branch[key]
        if (typeof descriptor === 'object' && 'is' in descriptor) {
          condition[key] = descriptor.is

        } else {
          if (!first) first = key
          last = key

          Template.defineProperty(object, branchname + index + key, descriptor)

          if (key in proxy_properties) {
            proxy_properties[key].push(index)
          } else {
            proxy_properties[key] = [index]
          }
        }
      }

      conditions.push(condition)
      Object.defineProperty(object, '__size_' + branchname + index, { get: function getBranchSize() {
        return this['__offset_' + branchname + index + last] + this['__size_' + branchname + index + last] - this['__offset_' + branchname + index + first]
      }})
    })

    // Proxy properties
    Object.keys(proxy_properties).forEach(function(key) {
      var associated_branches = proxy_properties[key]

      function active_branch() {
        var active_branches = activeBranches.call(this)
        for (var i = 0; i < active_branches.length; i++) {
          var active_branch = active_branches[i]
          if (associated_branches.indexOf(active_branch) !== -1) return active_branch
        }
        return undefined
      }

      Object.defineProperty(object, key, {
        get: function branchProxyGetter() {
          var active = active_branch.call(this)
          return (active === undefined) ? undefined : this[branchname + active + key]
        },
        set: function branchProxySetter(value) {
          var active = active_branch.call(this)
          if (!active) activate.call(this, active = associated_branches[0])
          this[branchname + active + key] = value
        }
      })
    })

    propertyExpression(object, offset, function getBranchOffset() { return this[prev_offset] + this[prev_size] })
    Object.defineProperty(object, size, { get: function getActiveBranchSize() {
      var active = activeBranches.call(this)[0]
      return (active === undefined) ? 0 : this['__size_' + branchname + active]
    }})

    object.__last = name
  }


  function List(parent, byteOffset, byteLength) {
    Template.call(this, parent, byteOffset, byteLength)
  }

  List.prototype = Object.create(Template.prototype, {
    __offset_undefined: { get: function() {
      throw new ReferenceError() // Prevents inlining any offset property
    }},

    last: { get: function getLast() {
      var last
      this.forEach(function(item) { last = item })
      return last
    }},

    size: { get: function getSize() {
      this.forEach(function() {})
      return this.__offset_item
    }},

    length: { get: function getLength() {
      if ('fixed_length' in this) return this.fixed_length

      var length = 0
      this.forEach(function() { length += 1 })
      return length
    }},

    set: { value: function setArray(array) {
      this.loop(function() {
        if (this.length < array.length) {
          this.item = array[this.length]
          return true

        } else {
          this.close()
          return false
        }
      })
    }},

    getItem: { value: function getItem(index) {
      var item
      this.forEach(function(current_item, i) {
        if (i === index) {
          item = current_item
          return false
        }
      })
      return item
    }},

    setItem: { value: function setItem(index, value) {
      var close_next
      this.loop(function() {
        if (close_next) {
          this.close()
          return false

        } else if (this.length === index) {
          close_next = true
          this.item = value
          return true

        } else {
          return !this.until()
        }
      })
    }},

    forEach: { value: function forEach(callback) {
      this.loop(function() {
        if (this.last !== undefined && callback(this.last, this.length - 1) === false) return false
        return !this.until()
      })
    }},

    loop: { value: function loop(callback) {
      this.__offset_item = 0
      this.next = this.item
      Object.defineProperties(this, {
        length: { value: 0        , writable: true, configurable: true },
        size:   { value: 0        , writable: true, configurable: true },
        last:   { value: undefined, writable: true, configurable: true }
      })

      while (callback.call(this)) {
        this.last = this.next
        this.length += 1
        this.size += (typeof this.last === 'object') ? this.last.size : this.__size_item
        this.__offset_item = this.size
        this.next = this.item
      }

      delete this.length
      delete this.size
      delete this.last
    }}
  })

  function defineDummyAccessor(object, index) {
    Object.defineProperty(object, index, {
      get: function getItemX() { return this.getItem(index) },
      set: function setItemX(value) { this.setItem(index, value) }
    })
  }

  for (var i = 0; i < 2000; i++) defineDummyAccessor(List.prototype, i)

  List.extend = function(options) {
    // Default until function: go as far as possible
    if (!options.until && !options.length) options.until = function() {
      try {
        // Stop if the end of the array would be beyond the end of the buffer
        return this.byteOffset + this.size + this.next.size > (this.buffer.length || this.buffer.byteLength)

      } catch (e) {
        if (e.name !== 'AssertionError' && e.name !== 'INDEX_SIZE_ERR' && e.name !== 'IndexSizeError' && e.message !== 'Index out of range.') throw e
        // If e is 'AssertionError: Trying to read beyond buffer length' then stop
        return true
      }
    }

    function TypedList(parent, byteOffset, byteLength) {
      List.call(this, parent, byteOffset, byteLength)
    }

    var structure = {
      until: { value: options.until, configurable: true },
      close: { value: options.close, configurable: true },
      item: options.array
    }

    TypedList.prototype = Template.create(List.prototype, structure)
    delete TypedList.prototype.__last
    delete TypedList.prototype.__offset_item  // Deleting item offset getter, setter. We will adjust it very often.
    delete TypedList.prototype.size  // Deleting inlined size

    if (options.length) {
      propertyExpression(TypedList.prototype, 'fixed_length', options.length)
      Object.defineProperty(TypedList.prototype, 'until', { value: function() {
        return this.length >= this.fixed_length
      }})
      Object.defineProperty(TypedList.prototype, 'close', { value: function() {
        this.fixed_length = this.length
      }})
    }

    return TypedList
  }


  return {
    View: View,
    Template: Template,
    List: List
  }
}))

});

require.define("/lib/streams/decoder.js",function(require,module,exports,__dirname,__filename,process,global){var util = require('util')
  , Stream = require('stream')
  , Packet = require('../Packet')
  , views = require('../views')
  , protocols = require('../tables/protocols')

var Decoder = function (protocol) {
  this.protocol = protocol
  this.ViewClass = views[protocols[protocol]]
}

util.inherits(Decoder, Stream)

Decoder.prototype.readable = true
Decoder.prototype.writable = true

Decoder.prototype.write = function (buffer) {
  this.emit('data', new this.ViewClass(buffer))
}

Decoder.prototype.end = function (buffer) {
  if (buffer) this.write(buffer)
  this.emit('end')
}

module.exports = function(protocol) {
  return new Decoder(protocol || 'ethernet')
}

});

require.define("util",function(require,module,exports,__dirname,__filename,process,global){var events = require('events');

exports.isArray = isArray;
exports.isDate = function(obj){return Object.prototype.toString.call(obj) === '[object Date]'};
exports.isRegExp = function(obj){return Object.prototype.toString.call(obj) === '[object RegExp]'};


exports.print = function () {};
exports.puts = function () {};
exports.debug = function() {};

exports.inspect = function(obj, showHidden, depth, colors) {
  var seen = [];

  var stylize = function(str, styleType) {
    // http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
    var styles =
        { 'bold' : [1, 22],
          'italic' : [3, 23],
          'underline' : [4, 24],
          'inverse' : [7, 27],
          'white' : [37, 39],
          'grey' : [90, 39],
          'black' : [30, 39],
          'blue' : [34, 39],
          'cyan' : [36, 39],
          'green' : [32, 39],
          'magenta' : [35, 39],
          'red' : [31, 39],
          'yellow' : [33, 39] };

    var style =
        { 'special': 'cyan',
          'number': 'blue',
          'boolean': 'yellow',
          'undefined': 'grey',
          'null': 'bold',
          'string': 'green',
          'date': 'magenta',
          // "name": intentionally not styling
          'regexp': 'red' }[styleType];

    if (style) {
      return '\033[' + styles[style][0] + 'm' + str +
             '\033[' + styles[style][1] + 'm';
    } else {
      return str;
    }
  };
  if (! colors) {
    stylize = function(str, styleType) { return str; };
  }

  function format(value, recurseTimes) {
    // Provide a hook for user-specified inspect functions.
    // Check that value is an object with an inspect function on it
    if (value && typeof value.inspect === 'function' &&
        // Filter out the util module, it's inspect function is special
        value !== exports &&
        // Also filter out any prototype objects using the circular check.
        !(value.constructor && value.constructor.prototype === value)) {
      return value.inspect(recurseTimes);
    }

    // Primitive types cannot have properties
    switch (typeof value) {
      case 'undefined':
        return stylize('undefined', 'undefined');

      case 'string':
        var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                                 .replace(/'/g, "\\'")
                                                 .replace(/\\"/g, '"') + '\'';
        return stylize(simple, 'string');

      case 'number':
        return stylize('' + value, 'number');

      case 'boolean':
        return stylize('' + value, 'boolean');
    }
    // For some reason typeof null is "object", so special case here.
    if (value === null) {
      return stylize('null', 'null');
    }

    // Look up the keys of the object.
    var visible_keys = Object_keys(value);
    var keys = showHidden ? Object_getOwnPropertyNames(value) : visible_keys;

    // Functions without properties can be shortcutted.
    if (typeof value === 'function' && keys.length === 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        var name = value.name ? ': ' + value.name : '';
        return stylize('[Function' + name + ']', 'special');
      }
    }

    // Dates without properties can be shortcutted
    if (isDate(value) && keys.length === 0) {
      return stylize(value.toUTCString(), 'date');
    }

    var base, type, braces;
    // Determine the object type
    if (isArray(value)) {
      type = 'Array';
      braces = ['[', ']'];
    } else {
      type = 'Object';
      braces = ['{', '}'];
    }

    // Make functions say that they are functions
    if (typeof value === 'function') {
      var n = value.name ? ': ' + value.name : '';
      base = (isRegExp(value)) ? ' ' + value : ' [Function' + n + ']';
    } else {
      base = '';
    }

    // Make dates with properties first say the date
    if (isDate(value)) {
      base = ' ' + value.toUTCString();
    }

    if (keys.length === 0) {
      return braces[0] + base + braces[1];
    }

    if (recurseTimes < 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        return stylize('[Object]', 'special');
      }
    }

    seen.push(value);

    var output = keys.map(function(key) {
      var name, str;
      if (value.__lookupGetter__) {
        if (value.__lookupGetter__(key)) {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Getter/Setter]', 'special');
          } else {
            str = stylize('[Getter]', 'special');
          }
        } else {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Setter]', 'special');
          }
        }
      }
      if (visible_keys.indexOf(key) < 0) {
        name = '[' + key + ']';
      }
      if (!str) {
        if (seen.indexOf(value[key]) < 0) {
          if (recurseTimes === null) {
            str = format(value[key]);
          } else {
            str = format(value[key], recurseTimes - 1);
          }
          if (str.indexOf('\n') > -1) {
            if (isArray(value)) {
              str = str.split('\n').map(function(line) {
                return '  ' + line;
              }).join('\n').substr(2);
            } else {
              str = '\n' + str.split('\n').map(function(line) {
                return '   ' + line;
              }).join('\n');
            }
          }
        } else {
          str = stylize('[Circular]', 'special');
        }
      }
      if (typeof name === 'undefined') {
        if (type === 'Array' && key.match(/^\d+$/)) {
          return str;
        }
        name = JSON.stringify('' + key);
        if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
          name = name.substr(1, name.length - 2);
          name = stylize(name, 'name');
        } else {
          name = name.replace(/'/g, "\\'")
                     .replace(/\\"/g, '"')
                     .replace(/(^"|"$)/g, "'");
          name = stylize(name, 'string');
        }
      }

      return name + ': ' + str;
    });

    seen.pop();

    var numLinesEst = 0;
    var length = output.reduce(function(prev, cur) {
      numLinesEst++;
      if (cur.indexOf('\n') >= 0) numLinesEst++;
      return prev + cur.length + 1;
    }, 0);

    if (length > 50) {
      output = braces[0] +
               (base === '' ? '' : base + '\n ') +
               ' ' +
               output.join(',\n  ') +
               ' ' +
               braces[1];

    } else {
      output = braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
    }

    return output;
  }
  return format(obj, (typeof depth === 'undefined' ? 2 : depth));
};


function isArray(ar) {
  return ar instanceof Array ||
         Array.isArray(ar) ||
         (ar && ar !== Object.prototype && isArray(ar.__proto__));
}


function isRegExp(re) {
  return re instanceof RegExp ||
    (typeof re === 'object' && Object.prototype.toString.call(re) === '[object RegExp]');
}


function isDate(d) {
  if (d instanceof Date) return true;
  if (typeof d !== 'object') return false;
  var properties = Date.prototype && Object_getOwnPropertyNames(Date.prototype);
  var proto = d.__proto__ && Object_getOwnPropertyNames(d.__proto__);
  return JSON.stringify(proto) === JSON.stringify(properties);
}

function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}

var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}

exports.log = function (msg) {};

exports.pump = null;

var Object_keys = Object.keys || function (obj) {
    var res = [];
    for (var key in obj) res.push(key);
    return res;
};

var Object_getOwnPropertyNames = Object.getOwnPropertyNames || function (obj) {
    var res = [];
    for (var key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) res.push(key);
    }
    return res;
};

var Object_create = Object.create || function (prototype, properties) {
    // from es5-shim
    var object;
    if (prototype === null) {
        object = { '__proto__' : null };
    }
    else {
        if (typeof prototype !== 'object') {
            throw new TypeError(
                'typeof prototype[' + (typeof prototype) + '] != \'object\''
            );
        }
        var Type = function () {};
        Type.prototype = prototype;
        object = new Type();
        object.__proto__ = prototype;
    }
    if (typeof properties !== 'undefined' && Object.defineProperties) {
        Object.defineProperties(object, properties);
    }
    return object;
};

exports.inherits = function(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object_create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
};

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (typeof f !== 'string') {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(exports.inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j': return JSON.stringify(args[i++]);
      default:
        return x;
    }
  });
  for(var x = args[i]; i < len; x = args[++i]){
    if (x === null || typeof x !== 'object') {
      str += ' ' + x;
    } else {
      str += ' ' + exports.inspect(x);
    }
  }
  return str;
};

});

require.define("events",function(require,module,exports,__dirname,__filename,process,global){if (!process.EventEmitter) process.EventEmitter = function () {};

var EventEmitter = exports.EventEmitter = process.EventEmitter;
var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    }
;
function indexOf (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (x === xs[i]) return i;
    }
    return -1;
}

// By default EventEmitters will print a warning if more than
// 10 listeners are added to it. This is a useful default which
// helps finding memory leaks.
//
// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
var defaultMaxListeners = 10;
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!this._events) this._events = {};
  this._events.maxListeners = n;
};


EventEmitter.prototype.emit = function(type) {
  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  var handler = this._events[type];
  if (!handler) return false;

  if (typeof handler == 'function') {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        var args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
    return true;

  } else if (isArray(handler)) {
    var args = Array.prototype.slice.call(arguments, 1);

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  } else {
    return false;
  }
};

// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
EventEmitter.prototype.addListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit('newListener', type, listener);

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {

    // Check for listener leak
    if (!this._events[type].warned) {
      var m;
      if (this._events.maxListeners !== undefined) {
        m = this._events.maxListeners;
      } else {
        m = defaultMaxListeners;
      }

      if (m && m > 0 && this._events[type].length > m) {
        this._events[type].warned = true;
        console.error('(node) warning: possible EventEmitter memory ' +
                      'leak detected. %d listeners added. ' +
                      'Use emitter.setMaxListeners() to increase limit.',
                      this._events[type].length);
        console.trace();
      }
    }

    // If we've already got an array, just append.
    this._events[type].push(listener);
  } else {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  var self = this;
  self.on(type, function g() {
    self.removeListener(type, g);
    listener.apply(this, arguments);
  });

  return this;
};

EventEmitter.prototype.removeListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = indexOf(list, listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter.prototype.listeners = function(type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

});

require.define("stream",function(require,module,exports,__dirname,__filename,process,global){var events = require('events');
var util = require('util');

function Stream() {
  events.EventEmitter.call(this);
}
util.inherits(Stream, events.EventEmitter);
module.exports = Stream;
// Backwards-compat with node 0.4.x
Stream.Stream = Stream;

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once, and
  // only when all sources have ended.
  if (!dest._isStdio && (!options || options.end !== false)) {
    dest._pipeCount = dest._pipeCount || 0;
    dest._pipeCount++;

    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest._pipeCount--;

    // remove the listeners
    cleanup();

    if (dest._pipeCount > 0) {
      // waiting for other incoming streams to end.
      return;
    }

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest._pipeCount--;

    // remove the listeners
    cleanup();

    if (dest._pipeCount > 0) {
      // waiting for other incoming streams to end.
      return;
    }

    dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (this.listeners('error').length === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('end', cleanup);
    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('end', cleanup);
  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

});

require.define("/lib/streams/filter.js",function(require,module,exports,__dirname,__filename,process,global){var util = require('util')
  , Stream = require('stream')

var Filter = function (filter) {
  this.filter = new Function('packet', 'with(packet) { return ' + filter + '}')
}

util.inherits(Filter, Stream)

Filter.prototype.readable = true
Filter.prototype.writable = true

Filter.prototype.write = function (packet) {
  try {
    var pass = this.filter(packet)
  } catch (e) {}

  if (pass) this.emit('data', packet)
}

Filter.prototype.end = function (packet) {
  if (packet) this.write(packet)
  this.emit('end')
}

module.exports = function(filter) {
  return new Filter(filter)
}

});

require.define("/lib/streams/printer.js",function(require,module,exports,__dirname,__filename,process,global){var util = require('util')
  , Stream = require('stream')

var Printer = function () {
}

util.inherits(Printer, Stream)

Printer.prototype.writable = true
Printer.prototype.readable = true

Printer.prototype.write = function (packet) {
  this.emit('data', packet.toString() + '\n')
}

Printer.prototype.end = function (packet) {
  if (packet) this.write(packet)
  this.emit('end')
}

module.exports = function() {
  return new Printer()
}

});

require.define("/lib/streams/tcp.js",function(require,module,exports,__dirname,__filename,process,global){var util = require('util')
  , Stream = require('stream')

function TCPConnection(a, b) {
  a.stream = new Stream()
  a.stream.readable = true
  a.stream.connection = this
  a.unacknowledged = {}
  a.fin = false

  b.stream = new Stream()
  b.stream.readable = true
  b.stream.connection = this
  b.unacknowledged = {}
  b.fin = false

  this.a = a
  this.b = b
  this.readable = true
}

util.inherits(TCPConnection, Stream)

TCPConnection.prototype.process = function(packet) {
  if (this.ended) return
  this.emit('data', packet.data, packet)

  var ip = packet.ipv4
    , tcp = packet.tcp
    , src = (this.a.ip === ip.src.toString() && this.a.port === tcp.srcport) ? this.a : this.b
    , dst = (src === this.a) ? this.b : this.a
    , payload = tcp.payload

  // Store the sent content until it is acknowledged
  if (payload.size !== 0) {
    src.unacknowledged[tcp.seq] = payload
  }

  // Emitting acknowledged data
  var chunk, last, ack = tcp.ack
  for (var seq in dst.unacknowledged) {
    if (!dst.unacknowledged.hasOwnProperty(seq)) continue

    chunk = dst.unacknowledged[seq]
    last = Number(seq) + chunk.size - 1

    if (last < ack) {
      delete dst.unacknowledged[seq]
      dst.stream.emit('data', chunk.data, chunk)
    }
  }

  // Ending the streams and the connection
  if (tcp.flags.fin) src.fin = true

  if (Object.keys(dst.unacknowledged).length === 0 && dst.fin) {
    if (!dst.stream.ended) (dst.stream.ended = true) && dst.stream.emit('end')
    if (!this.ended && src.stream.ended) (this.ended = true) && this.emit('end')
  }

  if (tcp.flags.reset) {
    if (!dst.stream.ended) (dst.stream.ended = true) && dst.stream.emit('end')
    if (!src.stream.ended) (src.stream.ended = true) && src.stream.emit('end')
    if (!this.ended) (this.ended = true) && this.emit('end')
  }
}

TCPConnection.prototype.toString = function() {
  return this.a.ip + ':' + this.a.port + ' - ' + this.b.ip + ':' + this.b.port
}

var TCPDemux = function () {
  this.connections = {}
}

util.inherits(TCPDemux, Stream)

TCPDemux.prototype.writable = true

TCPDemux.prototype.write = function (packet) {
  var ip = packet.ipv4
    , tcp = packet.tcp
  if (!tcp) return

  var src = ip.src + ':' + tcp.srcport
    , dst = ip.dst + ':' + tcp.dstport
    , key = [src, dst].sort().join(' - ')
    , connections = this.connections
    , connection = connections[key]

  if (!connection) {
    connection = new TCPConnection({ ip: ip.src.toString(), port: tcp.srcport }, { ip: ip.dst.toString(), port: tcp.dstport })
    connections[key] = connection
    connection.on('end', function() { delete connections[key] })
    this.emit('connection', connection.a.stream, connection.b.stream, connection)
  }

  connection.process(packet)
}

TCPDemux.prototype.end = function (packet) {
  if (packet) this.write(packet)
}

module.exports = function() {
  return new TCPDemux()
}

});

require.define("/lib/tables/ethertypes.js",function(require,module,exports,__dirname,__filename,process,global){module.exports = {
  0x0800: 'ipv4',
  0x0806: 'arp',
  0x86DD: 'ipv6'
}

});

require.define("/lib/tables/protocol_addresses.js",function(require,module,exports,__dirname,__filename,process,global){// protocol id -> address view name
module.exports = {
  ethernet: 'MACAddress',
  ipv4: 'IPv4Address'
}

});

require.define("/lib/tables/arphrd_types.js",function(require,module,exports,__dirname,__filename,process,global){// Reference: Linux kernel header file: kernel_src/include/uapi/linux/if_arp.h

module.exports = {
  1: 'ethernet'
}

});

require.define("/lib/views/DomainName.js",function(require,module,exports,__dirname,__filename,process,global){var Template = require('bt').Template
  , Text = require('./Text')

var DomainName = module.exports = Template.extend({
  labels: {
    array: { view: Text },
    until: function() {
      return this.next.len === 0 || this.next.len >= 192
    },
    close: function() {
      this.next.len = 0
    }
  },

  end:         { size: 2/8 },

  branches: [{
    end:       { is: 0 },
    padding:   { size: 6/8 }
  }, {
    end:       { is: 3 },
    pointer:   { size: 14/8 }
  }],

  // Base address of the pointer, compared to the underlying buffer. Default: the beginning of the parent dns packet
  pointer_base: { get: function() {
    return this.parent.parent.parent.byteOffset
  }},

  toString: { value: function() {
    var name = Array.prototype.join.call(this.labels, '.')
      , pointer = this.pointer

    if (pointer) {
      if (name.length > 0) name += '.'
      name += String(new DomainName(this.parent, (this.pointer_base + pointer) - this.parent.byteOffset))
    }

    return name
  }},

  set: { value: function(domain) {
    this.labels = domain.split('.')
  }}
})

});

require.define("/lib/views/Text.js",function(require,module,exports,__dirname,__filename,process,global){var Template = Template = require('bt').Template

module.exports = Template.extend({
  len:   { size: 1 },
  chars: {
    length: 'this.parent.len',
    array: { size: 1 }
  },

  toString: { value: function() {
    return String.fromCharCode.apply(null, this.chars)
  }},

  set: { value: function(string) {
    this.chars = Array.prototype.map.call(string, function(letter) { return letter.charCodeAt(0) })
  }}
})

});

require.define("/lib/tables/dns_record_types.js",function(require,module,exports,__dirname,__filename,process,global){/*
reference: http://www.iana.org/assignments/dns-parameters/dns-parameters.xml

Extraction:
$('#table-dns-parameters-4>tbody>tr').each(function() {
   var tds = $('td', this)
   if (Number(tds[1].textContent)) console.log(tds[1].textContent + ': \'' + tds[0].textContent + '\',')
})
*/

module.exports = {
  1: 'A',
  2: 'NS',
  3: 'MD',
  4: 'MF',
  5: 'CNAME',
  6: 'SOA',
  7: 'MB',
  8: 'MG',
  9: 'MR',
  10: 'NULL',
  11: 'WKS',
  12: 'PTR',
  13: 'HINFO',
  14: 'MINFO',
  15: 'MX',
  16: 'TXT',
  17: 'RP',
  18: 'AFSDB',
  19: 'X25',
  20: 'ISDN',
  21: 'RT',
  22: 'NSAP',
  23: 'NSAP-PTR',
  24: 'SIG',
  25: 'KEY',
  26: 'PX',
  27: 'GPOS',
  28: 'AAAA',
  29: 'LOC',
  30: 'NXT',
  31: 'EID',
  32: 'NIMLOC',
  33: 'SRV',
  34: 'ATMA',
  35: 'NAPTR',
  36: 'KX',
  37: 'CERT',
  38: 'A6',
  39: 'DNAME',
  40: 'SINK',
  41: 'OPT',
  42: 'APL',
  43: 'DS',
  44: 'SSHFP',
  45: 'IPSECKEY',
  46: 'RRSIG',
  47: 'NSEC',
  48: 'DNSKEY',
  49: 'DHCID',
  50: 'NSEC3',
  51: 'NSEC3PARAM',
  52: 'TLSA',
  55: 'HIP',
  56: 'NINFO',
  57: 'RKEY',
  58: 'TALINK',
  59: 'CDS',
  99: 'SPF',
  100: 'UINFO',
  101: 'UID',
  102: 'GID',
  103: 'UNSPEC',
  104: 'NID',
  105: 'L32',
  106: 'L64',
  107: 'LP',
  249: 'TKEY',
  250: 'TSIG',
  251: 'IXFR',
  252: 'AXFR',
  253: 'MAILB',
  254: 'MAILA',
  255: '*',
  256: 'URI',
  257: 'CAA',
  32768: 'TA',
  32769: 'DLV'
}

});

require.define("/lib/tables/dns_record_payloads.js",function(require,module,exports,__dirname,__filename,process,global){
module.exports = {
  'A': 'IPv4Address',
  'CNAME': 'DomainName'
}
});

require.define("/lib/tables/dns_classes.js",function(require,module,exports,__dirname,__filename,process,global){/*
reference: http://www.iana.org/assignments/dns-parameters/dns-parameters.xml
*/

module.exports = {
  1: 'IN',
  3: 'CH',
  4: 'HS',
  254: 'NONE',
  255: 'ANY'
}

});

require.define("/lib/views/MACAddress.js",function(require,module,exports,__dirname,__filename,process,global){var Template = require('bt').Template

var hex = []
for (var i = 0; i < 256; i++) hex[i] = (0x100 + i).toString(16).substr(1).toUpperCase()

module.exports = Template.extend({
  0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1,

  toString: { value: function() {
    return hex[this[0]] + ':' + hex[this[1]] + ':' + hex[this[2]] + ':' +
           hex[this[3]] + ':' + hex[this[4]] + ':' + hex[this[5]]
  }},

  set: { value: function(value) {
    if (typeof value === 'string') {
      var octets = value.split(':').map(function(hex) { return parseInt(hex, 16) })
      for (var i = 0; i < 6; i++) this[i] = octets[i]

    } else if (value instanceof MACAddress) {
      this.setUint32(0, value.getUint32(0))
      this.setUint16(4, value.getUint16(4))
    }
  }}
})

});

require.define("/lib/algorithms/rfc1071.js",function(require,module,exports,__dirname,__filename,process,global){module.exports = function(buffer, offset, length) {
  offset = offset || 0
  length = length || buffer.length - offset

  var checksum = 0

  for (var cursor = 0; cursor < length; cursor += 2) {
    checksum += buffer.getUint16(offset + cursor)
    checksum = (checksum & 0xffff) + (checksum >> 16)
  }

  return 0xffff - checksum
}

});

require.define("/lib/views/IPv4Address.js",function(require,module,exports,__dirname,__filename,process,global){var Template = require('bt').Template

module.exports = Template.extend({
  0: 1, 1: 1, 2: 1, 3: 1,

  toString: { value: function() {
    return this[0] + '.' + this[1] + '.' + this[2] + '.' + this[3]
  }},

  set: { value: function(value) {
    if (typeof value === 'string') {
      var octets = value.split('.').map(Number)
      for (var i = 0; i < 4; i++) this[i] = octets[i]

    } else if (value instanceof IPv4Address) {
      this.setUint32(0, value.getUint32(0))
    }
  }}
})

});

require.define("/lib/tables/ip_protocol_numbers.js",function(require,module,exports,__dirname,__filename,process,global){// Reference: http://www.iana.org/assignments/protocol-numbers/protocol-numbers.xml
module.exports = {
  1: 'icmp',
  6: 'tcp',
  17: 'udp'
}

});

require.define("/lib/views/PcapRecord.js",function(require,module,exports,__dirname,__filename,process,global){var Packet = require('../Packet')

module.exports = Packet.extend({
  little_endian:    { get: function() { return this.parent.parent.little_endian } },

  ts_sec:           { size: 4, little_endian: 'this.little_endian' },
  ts_usec:          { size: 4, little_endian: 'this.little_endian' },
  incl_len:         { size: 4, little_endian: 'this.little_endian' },
  orig_len:         { size: 4, little_endian: 'this.little_endian' },

  payload_protocol: { get: function() { return this.parent.parent.network } },
  payload_view:     { size: 'this.incl_len', view: Packet.views.Template },

  protocol:         { value: 'pcap' }
})

});

require.define("/lib/tables/pcap_linktypes.js",function(require,module,exports,__dirname,__filename,process,global){/* Reference: http://www.tcpdump.org/linktypes.html */
module.exports = {
  1: 'ethernet',
  113: 'linux_cooked'
}

});

require.define("/lib/views/TCPOption.js",function(require,module,exports,__dirname,__filename,process,global){var Template = require('bt').Template

var simple_options = [0, 1]

module.exports = Template.extend({
  kind: {
    copied: 1/8,
    class:  2/8,
    number: 5/8
  },

  len_size: {
    get: function() { return (simple_options.indexOf(Number(this.kind)) !== -1) ? 0 : 1 }
  },
  len:    { size: 'this.len_size' },

  data_size: {
    get: function() { return (simple_options.indexOf(Number(this.kind)) !== -1) ? 0 : this.len - 2 },
    set: function(value) { this.len = value + 2 }
  },
  data:   { size: 'this.data_size' }
})

});

require.define("/index.js",function(require,module,exports,__dirname,__filename,process,global){module.exports = require('./lib/Packet')

module.exports.views = require('./lib/views')

module.exports.stream = {
  decoder: require('./lib/streams/decoder'),
  filter: require('./lib/streams/filter'),
  printer: require('./lib/streams/printer'),
  tcp: require('./lib/streams/tcp')
}

});
window.Packet = require("/index.js");

require.define("/lib/views/ARPPacket.js",function(require,module,exports,__dirname,__filename,process,global){var ethertypes = require('../tables/ethertypes')
  , Packet = require('../Packet')
  , views = require('../views')
  , addresses = require('../tables/protocol_addresses')
  , arphrd_types = require('../tables/arphrd_types')

var opcodes = {
  1: 'request',
  2: 'reply'
}

module.exports = Packet.extend({
  hw_type:    { size: 2, domain: arphrd_types },
  proto_type: { size: 2, domain: ethertypes },
  hw_size:    { size: 1 },
  proto_size: { size: 1 },
  opcode:     { size: 2, domain: opcodes },

  src_hw:     { size: 'this.hw_size   ', view: function() { return views[addresses[this.hw_type   ]] } },
  src_proto:  { size: 'this.proto_size', view: function() { return views[addresses[this.proto_type]] } },
  dst_hw:     { size: 'this.hw_size   ', view: function() { return views[addresses[this.hw_type   ]] } },
  dst_proto:  { size: 'this.proto_size', view: function() { return views[addresses[this.proto_type]] } },

  protocol:   { value: 'arp' },

  toString:   { value: function() {
    if (this.opcode === 'request') {
      return 'ARP: Who has ' + this.dst_proto.toString() + '? Tell ' + this.src_proto.toString()
    } else {
      return 'ARP: ' + this.src_proto.toString() + ' is at ' + this.dst_hw.toString()
    }
  }}
})

});
require("/lib/views/ARPPacket.js");

require.define("/lib/views/DNSPacket.js",function(require,module,exports,__dirname,__filename,process,global){var Template = require('bt').Template
  , Packet = require('../Packet')
  , DomainName = require('./DomainName')
  , record_types = require('../tables/dns_record_types')
  , record_payloads = require('../tables/dns_record_payloads')
  , classes = require('../tables/dns_classes')
  , views = require('../views')

var ResourceRecord = Template.extend({
  name:       DomainName,
  type:       { size: 2, domain: record_types },
  class:      { size: 2, domain: classes },
  ttl:        4,
  rd_length:  2,
  rdata:      { size: 'this.rd_length', view: function() { return views[record_payloads[this.type]] } }
})

module.exports = Packet.extend({
  id:              2,

  flags: {
    response:      1/8,
    opcode:        4/8,
    authoritative: 1/8,
    truncated:     1/8,
    recdesired:    1/8,
    recavail:      1/8,
    reserved:      3/8,
    rcode:         4/8
  },

  count: {
    queries:       2,
    answers:       2,
    auth_rr:       2,
    add_rr:        2
  },

  queries: {
    array: {
      name:       DomainName,
      type:       { size: 2, domain: record_types },
      class:      { size: 2, domain: classes }
    },
    length:       'this.parent.count.queries'
  },

  answers: {
    array:        ResourceRecord,
    length:       'this.parent.count.answers'
  },

  auth: {
    array:        ResourceRecord,
    length:       'this.parent.count.auth_rr'
  },

  additional: {
    array:        ResourceRecord,
    length:       'this.parent.count.add_rr'
  },

  protocol:       { value: 'dns' },

  toString: { value: function() {
    var queries = Array.prototype.slice.call(this.queries)
      , answers = Array.prototype.slice.call(this.answers)

    var string = queries.map(function(query) {
      return query.name.toString() + '?'
    }).join(' ')

    string += ' ' + answers.map(function(answer) {
      return answer.name.toString() + '!'
    }).join(' ')

    return 'DNS ' + string
  }}
})

});
require("/lib/views/DNSPacket.js");

require.define("/lib/views/DomainName.js",function(require,module,exports,__dirname,__filename,process,global){var Template = require('bt').Template
  , Text = require('./Text')

var DomainName = module.exports = Template.extend({
  labels: {
    array: { view: Text },
    until: function() {
      return this.next.len === 0 || this.next.len >= 192
    },
    close: function() {
      this.next.len = 0
    }
  },

  end:         { size: 2/8 },

  branches: [{
    end:       { is: 0 },
    padding:   { size: 6/8 }
  }, {
    end:       { is: 3 },
    pointer:   { size: 14/8 }
  }],

  // Base address of the pointer, compared to the underlying buffer. Default: the beginning of the parent dns packet
  pointer_base: { get: function() {
    return this.parent.parent.parent.byteOffset
  }},

  toString: { value: function() {
    var name = Array.prototype.join.call(this.labels, '.')
      , pointer = this.pointer

    if (pointer) {
      if (name.length > 0) name += '.'
      name += String(new DomainName(this.parent, (this.pointer_base + pointer) - this.parent.byteOffset))
    }

    return name
  }},

  set: { value: function(domain) {
    this.labels = domain.split('.')
  }}
})

});
require("/lib/views/DomainName.js");

require.define("/lib/views/EthernetFrame.js",function(require,module,exports,__dirname,__filename,process,global){var ethertypes = require('../tables/ethertypes')
  , MACAddress = require('./MACAddress.js')
  , Packet = require('../Packet')

module.exports = Packet.extend({
  destination:  MACAddress,
  source:       MACAddress,

  ethertype: [{
    type:       { size: 2, domain: ethertypes }
  }, {
    len:        { size: 2 }
  }],

  payload_view: { view: Packet.views.Template },


  protocol: { value: 'ethernet' },

  payload_protocol: {
    get: function() { return this.type },
    set: function(value) { this.type = value }
  },

  toString: { value: function() {
    return 'Eth ' + this.source.toString() + ' -> ' + this.destination.toString() +
           ' | ' + this.payload.toString()
  } }
})

});
require("/lib/views/EthernetFrame.js");

require.define("/lib/views/ICMPPacket.js",function(require,module,exports,__dirname,__filename,process,global){var Packet = require('../Packet')
  , Template = require('bt').Template
  , checksum = require('../algorithms/rfc1071')

var details = {
  0: Template.extend({
    id:  2,
    seq: 2
  })
}

// Echo and echo reply have the same structure
details[8] = details[0]

module.exports = Packet.extend({
  type:      1,
  code:      1,
  checksum:  2,
  details:   { view: function() { return details[this.type] } },

  protocol: { value: 'icmp' },

  finalize: { value: function() {
    this.checksum = 0
    this.checksum = checksum(this.root, this.root_offset, this.size)
  }},

  toString: { value: function() {
    return 'ICMP ' + this.type
  } }
})

});
require("/lib/views/ICMPPacket.js");

require.define("/lib/views/IPv4Address.js",function(require,module,exports,__dirname,__filename,process,global){var Template = require('bt').Template

module.exports = Template.extend({
  0: 1, 1: 1, 2: 1, 3: 1,

  toString: { value: function() {
    return this[0] + '.' + this[1] + '.' + this[2] + '.' + this[3]
  }},

  set: { value: function(value) {
    if (typeof value === 'string') {
      var octets = value.split('.').map(Number)
      for (var i = 0; i < 4; i++) this[i] = octets[i]

    } else if (value instanceof IPv4Address) {
      this.setUint32(0, value.getUint32(0))
    }
  }}
})

});
require("/lib/views/IPv4Address.js");

require.define("/lib/views/IPv4Packet.js",function(require,module,exports,__dirname,__filename,process,global){var IPv4Address = require('./IPv4Address')
  , Packet = require('../Packet')
  , protocol_numbers = require('../tables/ip_protocol_numbers')

function hdr_len_assertion(value) {
  if (value < 5) throw new Error('hdr_len should be at least 5')
}

function len_assertion(value) {
  if (value <= this.hdr_len * 4) throw new Error('len should be more than hdr_len * 4')
}

module.exports = Packet.extend({
  version:      4/8,
  hdr_len:      { size: 4/8, assert: hdr_len_assertion },
  tos_field: [{
    dscp:       6/8,
    ecn:        2/8
  }, {
    tos:        8/8
  }],
  len:          { size: 2, assert: len_assertion },
  id:           2,
  flags: {
    rb:         1/8,
    df:         1/8,
    mf:         1/8
  },
  frag_offset:  13/8,
  ttl:          1,
  proto:        { size: 1, domain: protocol_numbers },
  checksum:     2,
  src:          IPv4Address,
  dst:          IPv4Address,
  payload_view: { size: 'this.len - this.hdr_len * 4', offset: 'this.hdr_len * 4', view: Packet.views.Template },


  protocol: { value: 'ipv4' },

  payload_protocol: {
    get: function() { return this.proto },
    set: function(value) { this.proto = value }
  },

  toString: { value: function() {
    return 'IPv4 ' + this.src.toString() + ' -> ' + this.dst.toString() + ' | ' + this.payload.toString()
  } }
})

});
require("/lib/views/IPv4Packet.js");

require.define("/lib/views/LinuxCookedPacket.js",function(require,module,exports,__dirname,__filename,process,global){var Packet = require('../Packet')
  , ethertypes = require('../tables/ethertypes')
  , arphrd_types = require('../tables/arphrd_types')
  , protocol_addresses = require('../tables/protocol_addresses')
  , views = require('../views')

// Reference: http://www.tcpdump.org/linktypes/LINKTYPE_LINUX_SLL.html

var type_string = {
  0: '-> us', // Sent to us
  1: '-> bc', // Broadcast by sy. else
  2: '-> mc', // Multicast by sy. else
  3: '->   ', // Sent by sy. else to sy. else
  4: 'us ->'  // Sent by us
}

module.exports = Packet.extend({
  type:             { size: 2 },
  network:          { size: 2, domain: arphrd_types },
  address_size:     { size: 2 },
  address:          { size: 'this.address_size', view: function() { return views[protocol_addresses[this.network]] } },
  padding:          { size: '8 - this.address_size' },

  payload_protocol: { size: 2, domain: ethertypes },
  payload_view:     { view: Packet.views.Template },

  protocol:         { value: 'linux_cooked' },

  toString: { value: function() {
    return 'LC (' + this.network + ') ' + this.address.toString() + ' ' + type_string[this.type] +
           ' | ' + this.payload.toString()
  }}
})

});
require("/lib/views/LinuxCookedPacket.js");

require.define("/lib/views/MACAddress.js",function(require,module,exports,__dirname,__filename,process,global){var Template = require('bt').Template

var hex = []
for (var i = 0; i < 256; i++) hex[i] = (0x100 + i).toString(16).substr(1).toUpperCase()

module.exports = Template.extend({
  0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1,

  toString: { value: function() {
    return hex[this[0]] + ':' + hex[this[1]] + ':' + hex[this[2]] + ':' +
           hex[this[3]] + ':' + hex[this[4]] + ':' + hex[this[5]]
  }},

  set: { value: function(value) {
    if (typeof value === 'string') {
      var octets = value.split(':').map(function(hex) { return parseInt(hex, 16) })
      for (var i = 0; i < 6; i++) this[i] = octets[i]

    } else if (value instanceof MACAddress) {
      this.setUint32(0, value.getUint32(0))
      this.setUint16(4, value.getUint16(4))
    }
  }}
})

});
require("/lib/views/MACAddress.js");

require.define("/lib/views/PcapFile.js",function(require,module,exports,__dirname,__filename,process,global){var Template = require('bt').Template
  , PcapRecord = require('./PcapRecord')
  , linktypes = require('../tables/pcap_linktypes')

module.exports = Template.extend({
  magic_number:  { size: 4, little_endian: true },
  little_endian: {
    get: function() { return this.magic_number === 0xa1b2c3d4 },
    set: function(value) { this.magic_number = value ? 0xa1b2c3d4 : 0xd4c3b2a1 }
  },

  version_major: { size: 2, little_endian: 'this.little_endian' },
  version_minor: { size: 2, little_endian: 'this.little_endian' },
  thiszone:      { size: 4, little_endian: 'this.little_endian' },
  sigfigs:       { size: 4, little_endian: 'this.little_endian' },
  snaplen:       { size: 4, little_endian: 'this.little_endian' },
  network:       { size: 4, little_endian: 'this.little_endian', domain: linktypes },

  packets: { array: { view: PcapRecord } }
})

});
require("/lib/views/PcapFile.js");

require.define("/lib/views/PcapRecord.js",function(require,module,exports,__dirname,__filename,process,global){var Packet = require('../Packet')

module.exports = Packet.extend({
  little_endian:    { get: function() { return this.parent.parent.little_endian } },

  ts_sec:           { size: 4, little_endian: 'this.little_endian' },
  ts_usec:          { size: 4, little_endian: 'this.little_endian' },
  incl_len:         { size: 4, little_endian: 'this.little_endian' },
  orig_len:         { size: 4, little_endian: 'this.little_endian' },

  payload_protocol: { get: function() { return this.parent.parent.network } },
  payload_view:     { size: 'this.incl_len', view: Packet.views.Template },

  protocol:         { value: 'pcap' }
})

});
require("/lib/views/PcapRecord.js");

require.define("/lib/views/TCPOption.js",function(require,module,exports,__dirname,__filename,process,global){var Template = require('bt').Template

var simple_options = [0, 1]

module.exports = Template.extend({
  kind: {
    copied: 1/8,
    class:  2/8,
    number: 5/8
  },

  len_size: {
    get: function() { return (simple_options.indexOf(Number(this.kind)) !== -1) ? 0 : 1 }
  },
  len:    { size: 'this.len_size' },

  data_size: {
    get: function() { return (simple_options.indexOf(Number(this.kind)) !== -1) ? 0 : this.len - 2 },
    set: function(value) { this.len = value + 2 }
  },
  data:   { size: 'this.data_size' }
})

});
require("/lib/views/TCPOption.js");

require.define("/lib/views/TCPSegment.js",function(require,module,exports,__dirname,__filename,process,global){var Packet = require('../Packet')
  , Template = require('bt').Template
  , TCPOption = require('./TCPOption')
  , IPv4Address = require('./IPv4Address')
  , checksum = require('../algorithms/rfc1071')

var PseudoHeader = Template.extend({
  src:      IPv4Address,
  dst:      IPv4Address,
  zeros:    1,
  protocol: 1,
  length:   2,

  sum: { value: function() {
    // checksum  === 0xffff - sum
    // sum       === 0xffff - checksum
    return 0xffff - checksum(this.root, 0, this.size)
  }}
})
var pseudo_header = new PseudoHeader(new ArrayBuffer(12))

module.exports = Packet.extend({
  srcport:      2,
  dstport:      2,
  seq:          4,
  ack:          4,
  hdr_len:      4/8,
  flags: {
    res:        3/8,
    ns:         1/8,
    cwr:        1/8,
    ecn:        1/8,
    urg:        1/8,
    ack:        1/8,
    push:       1/8,
    reset:      1/8,
    syn:        1/8,
    fin:        1/8
  },
  window_size:  2,
  checksum:     2,
  urgent_ptr:   2,

  options: {
    until: function() {
      return (this.size === this.parent.hdr_len * 4 - this.offset) || this.next.kind == 0
    },
    close: function() {
      var hdr_len = (this.offset + this.size) / 4
      if (hdr_len % 1 !== 0) this.next.kind = 0
      this.parent.hdr_len = Math.ceil(hdr_len)
    },
    array: { view: TCPOption }
  },

  payload_view: { offset: 'this.hdr_len * 4', view: Packet.views.Template },

  finalize: { value: function(options) {
    var size = this.size

    pseudo_header.set({
      src: options.src || this.parent.src.toString(),
      dst: options.dst || this.parent.dst.toString(),
      zeros: 0,
      protocol: 6, // See IP protocol numbers in ../tables/ip_protocol_numbers
      length: size
    })

    this.checksum = pseudo_header.sum()
    this.checksum = checksum(this.root, this.root_offset, size)
  }},

  protocol: { value: 'tcp' },

  toString: { value: function() {
    var flags = this.flags
    return ( 'TCP '
           + this.srcport + ' -> ' + this.dstport
           + ' ('
           + (flags.syn ? 'S' : ' ')
           + (flags.ack ? 'A' : ' ')
           + (flags.fin ? 'F' : ' ')
           + ')'
           ) +
           ' | ' + this.payload.toString()
  }}
})

});
require("/lib/views/TCPSegment.js");

require.define("/lib/views/Text.js",function(require,module,exports,__dirname,__filename,process,global){var Template = Template = require('bt').Template

module.exports = Template.extend({
  len:   { size: 1 },
  chars: {
    length: 'this.parent.len',
    array: { size: 1 }
  },

  toString: { value: function() {
    return String.fromCharCode.apply(null, this.chars)
  }},

  set: { value: function(string) {
    this.chars = Array.prototype.map.call(string, function(letter) { return letter.charCodeAt(0) })
  }}
})

});
require("/lib/views/Text.js");

require.define("/lib/views/UDPDatagram.js",function(require,module,exports,__dirname,__filename,process,global){var Packet = require('../Packet')

module.exports = Packet.extend({
  srcport:      { size: 2 },
  dstport:      { size: 2 },
  len:          { size: 2 },
  checksum:     { size: 2 },
  payload_view: { size: 'this.len - 8', view: Packet.views.Template },


  payload_protocol: { get: function() {
    if (this.srcport === 53 || this.dstport === 53) return 'dns'
  }},

  protocol: { value: 'udp', enumerable: true },

  toString: { value: function() {
    return 'UDP ' + this.srcport + ' -> ' + this.dstport +
           ' | ' + this.payload.toString()
  } }
})

});
require("/lib/views/UDPDatagram.js");
})();

