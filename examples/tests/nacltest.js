// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.


function $(id) {
  return document.getElementById(id);
}

// BEGIN MODIFICATION copied from common.js
var addListener = function(elt, event_name, callback) {
  if (elt.addEventListener) {
    elt.addEventListener(event_name, callback, false);
  } else {
    elt.attachEvent("on" + event_name, callback);
  }
};

// Canonicalize the URL using the DOM.
var resolveURL = function(url) {
  var a = document.createElement('a');
  a.href = url;
  return a.href;
}

// Search for a script element in the page.  The user may have loaded it
// themselves or it could have been dynamically loaded by the subsequent code.
var findScript = function(src) {
  var scripts = document.getElementsByTagName('script');
  for (var i = 0; i < scripts.length; i++) {
    if (scripts[i].src === src) {
      return scripts[i];
    }
  }
  return null;
}

// A look-up table for the scripts we're waiting for.
var waiting = {};

// Make sure the specified script is loaded before invoking a callback.
var loadScript = function(url, onload, onerror) {
  var src = resolveURL(url);
  if (findScript(src) === null) {
    // Loading the script if it cannot be found.
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = src;

    waiting[src] = [];
    script.onload = function() {
      for (var i in waiting[src]) {
        waiting[src][i].onload();
      }
      delete waiting[src];
    };
    script.onerror = function() {
      for (var i in waiting[src]) {
        if (waiting[src][i].onerror) {
          waiting[src][i].onerror();
        }
      }
      delete waiting[src];
    };
    document.getElementsByTagName('head')[0].appendChild(script);
  }

  // If src is in waiting, we have started to load the script but it is not
  // yet ready.
  if (src in waiting) {
    waiting[src].push({onload: onload, onerror: onerror});
  } else {
    // HACK assumes the script loaded successfully.
    onload();
  }
}

function createEmscriptenModule(name, tool, path, width, height) {
  // Create a fake embed element.  The actual script may take a while to load.
  var e = document.createElement("span");
  e.setAttribute("name", "nacl_module");
  e.setAttribute("id", "nacl_module");
  document.getElementById('listener').appendChild(e);

  var src = path + '/' + name + '.js';
  e.setAttribute("src", src);
  loadScript(src, function() {
    CreateInstance(width, height, e);
    // Instead of listening to DOM mutation events (which has cross-platform
    // compatibility issues), explicitly notify the instance that it has been
    // inserted into the document.
    e.finishLoading();
  }, function() {
    // TODO send event.
    e.readyState = 4;
    e.lastError = "Could not load " + src;
  });
  return e;
}

/**
 * Create the Native Client <embed> element as a child of the DOM element
 * named "listener".
 *
 * @param {string} name The name of the example.
 * @param {string} tool The name of the toolchain, e.g. "glibc", "newlib" etc.
 * @param {string} path Directory name where .nmf file can be found.
 * @param {number} width The width to create the plugin.
 * @param {number} height The height to create the plugin.
 * @param {Object} optional dictionary of args to send to DidCreateInstance
 */
function createNaClModule(name, tool, config, path, width, height, args) {
  if (tool == 'emscripten') {
    return createEmscriptenModule(name, tool, path, width, height);
  }
  var moduleEl = document.createElement('embed');
  moduleEl.setAttribute('name', 'nacl_module');
  moduleEl.setAttribute('id', 'nacl_module');
  moduleEl.setAttribute('width', width);
  moduleEl.setAttribute('height',height);
  moduleEl.setAttribute('path', path);
  moduleEl.setAttribute('src', path + '/' + name + '.nmf');

  // Add any optional arguments
  if (args) {
    for (var key in args) {
      moduleEl.setAttribute(key, args[key])
    }
  }

  // For NaCL modules use application/x-nacl.
  var mimetype = 'application/x-nacl';
  var isHost = tool == 'win' || tool == 'linux' || tool == 'mac';
  if (isHost) {
    // For non-nacl PPAPI plugins use the x-ppapi-debug/release
    // mime type.
    if (path.toLowerCase().indexOf('release') != -1)
      mimetype = 'application/x-ppapi-release';
    else
      mimetype = 'application/x-ppapi-debug';
  } else if (tool == 'pnacl' && config != 'Debug') {
    mimetype = 'application/x-pnacl';
  }
  moduleEl.setAttribute('type', mimetype);

  // The <EMBED> element is wrapped inside a <DIV>, which has both a 'load'
  // and a 'message' event listener attached.  This wrapping method is used
  // instead of attaching the event listeners directly to the <EMBED> element
  // to ensure that the listeners are active before the NaCl module 'load'
  // event fires.
  var listenerDiv = document.getElementById('listener');
  listenerDiv.appendChild(moduleEl);

  // Host plugins don't send a moduleDidLoad message. We'll fake it here.
  if (isHost) {
    window.setTimeout(function () {
      var evt = document.createEvent('Event');
      evt.initEvent('load', true, true);  // bubbles, cancelable
      moduleEl.dispatchEvent(evt);
    }, 100);  // 100 ms
  }
  return moduleEl;
}

function createTestModule(name, width, height) {
  args = getTestArguments({"tc": "emscripten", "config": "Debug"});
  return createNaClModule(name, args["tc"], args["config"], args["tc"] + "/" + args["config"], width, height);
}
// END MODIFICATION

function createNaClEmbed(args) {
  var fallback = function(value, default_value) {
    return value !== undefined ? value : default_value;
  };
  var embed = document.createElement('embed');
  embed.id = args.id;
  embed.src = args.src;
  embed.type = fallback(args.type, 'application/x-nacl');
  // JavaScript inconsistency: this is equivalent to class=... in HTML.
  embed.className = fallback(args.className, 'naclModule');
  embed.width = fallback(args.width, 0);
  embed.height = fallback(args.height, 0);
  return embed;
}


function decodeURIArgs(encoded) {
  var args = {};
  if (encoded.length > 0) {
    var pairs = encoded.replace(/\+/g, ' ').split('&');
    for (var p = 0; p < pairs.length; p++) {
      var pair = pairs[p].split('=');
      if (pair.length != 2) {
        throw "Malformed argument key/value pair: '" + pairs[p] + "'";
      }
      args[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
    }
  }
  return args;
}


function addDefaultsToArgs(defaults, args) {
  for (var key in defaults) {
    if (!(key in args)) {
      args[key] = defaults[key];
    }
  }
}


// Return a dictionary of arguments for the test.  These arguments are passed
// in the query string of the main page's URL.  Any time this function is used,
// default values should be provided for every argument.  In some cases a test
// may be run without an expected query string (manual testing, for example.)
// Careful: all the keys and values in the dictionary are strings.  You will
// need to manually parse any non-string values you wish to use.
function getTestArguments(defaults) {
  var encoded = window.location.search.substring(1);
  var args = decodeURIArgs(encoded);
  if (defaults !== undefined) {
    addDefaultsToArgs(defaults, args);
  }
  return args;
}


function exceptionToLogText(e) {
  if (typeof e == 'object' && 'message' in e && 'stack' in e) {
    return e.message + '\n' + e.stack.toString();
  } else if (typeof(e) == 'string') {
    return e;
  } else {
    return toString(e)
  }
}


// Logs test results to the server using URL-encoded RPC.
// Also logs the same test results locally into the DOM.
function RPCWrapper() {
  // Work around how JS binds 'this'
  var this_ = this;
  // It is assumed RPC will work unless proven otherwise.
  this.rpc_available = false; // HACK disable
  // Set to true if any test fails.
  this.ever_failed = false;
  // Async calls can make it faster, but it can also change order of events.
  this.async = false;

  // Called if URL-encoded RPC gets a 404, can't find the server, etc.
  function handleRPCFailure(name, message) {
    // This isn't treated as a testing error - the test can be run without a
    // web server that understands RPC.
    this_.logLocal('RPC failure for ' + name + ': ' + message + ' - If you ' +
                   'are running this test manually, this is not a problem.',
                   'gray');
    this_.disableRPC();
  }

  function handleRPCResponse(name, req) {
    if (req.status == 200) {
      if (req.responseText == 'Die, please') {
        // TODO(eugenis): this does not end the browser process on Mac.
        window.close();
      } else if (req.responseText != 'OK') {
        this_.logLocal('Unexpected RPC response to ' + name + ': \'' +
                       req.responseText + '\' - If you are running this test ' +
                       'manually, this is not a problem.', 'gray');
        this_.disableRPC();
      }
    } else {
      handleRPCFailure(name, req.status.toString());
    }
  }

  // Performs a URL-encoded RPC call, given a function name and a dictionary
  // (actually just an object - it's a JS idiom) of parameters.
  function rpcCall(name, params) {
    if (window.domAutomationController !== undefined) {
      // Running as a Chrome browser_test.
      var msg = {type: name};
      for (var pname in params) {
        msg[pname] = params[pname];
      }
      domAutomationController.setAutomationId(0);
      domAutomationController.send(JSON.stringify(msg));
    } else if (this_.rpc_available) {
      // Construct the URL for the RPC request.
      var args = [];
      for (var pname in params) {
        pvalue = params[pname];
        args.push(encodeURIComponent(pname) + '=' + encodeURIComponent(pvalue));
      }
      var url = '/TESTER/' + name + '?' + args.join('&');
      var req = new XMLHttpRequest();
      // Async result handler
      if (this_.async) {
        req.onreadystatechange = function() {
          if (req.readyState == XMLHttpRequest.DONE) {
            handleRPCResponse(name, req);
          }
        }
      }
      try {
        req.open('GET', url, this_.async);
        req.send();
        if (!this_.async) {
          handleRPCResponse(name, req);
        }
      } catch (err) {
        handleRPCFailure(name, err.toString());
      }
    }
  }

  // Pretty prints an error into the DOM.
  this.logLocalError = function(message) {
    this.logLocal(message, 'red');
    this.visualError();
  }

  // If RPC isn't working, disable it to stop error message spam.
  this.disableRPC = function() {
    if (this.rpc_available) {
      this.rpc_available = false;
      this.logLocal('Disabling RPC', 'gray');
    }
  }

  this.startup = function() {
    // TODO(ncbray) move into test runner
    this.num_passed = 0;
    this.num_failed = 0;
    this.num_errors = 0;
    this._log('[STARTUP]');
  }

  this.shutdown = function() {
    if (this.num_passed == 0 && this.num_failed == 0 && this.num_errors == 0) {
      this.client_error('No tests were run. This may be a bug.');
    }
    var full_message = '[SHUTDOWN] ';
    full_message += this.num_passed + ' passed';
    full_message += ', ' + this.num_failed + ' failed';
    full_message += ', ' + this.num_errors + ' errors';
    this.logLocal(full_message);
    rpcCall('Shutdown', {message: full_message, passed: !this.ever_failed});

    if (this.ever_failed) {
      this.localOutput.style.border = '2px solid #FF0000';
    } else {
      this.localOutput.style.border = '2px solid #00FF00';
    }
  }

  this.ping = function() {
    rpcCall('Ping', {});
  }

  this.heartbeat = function() {
    rpcCall('JavaScriptIsAlive', {});
  }

  this.client_error = function(message) {
    this.num_errors += 1;
    this.visualError();
    var full_message = '\n[CLIENT_ERROR] ' + exceptionToLogText(message)
    // The client error could have been generated by logging - be careful.
    try {
      this._log(full_message, 'red');
    } catch (err) {
      // There's not much that can be done, at this point.
    }
  }

  this.begin = function(test_name) {
    var full_message = '[' + test_name + ' BEGIN]'
    this._log(full_message, 'blue');
  }

  this._log = function(message, color, from_completed_test) {
    if (typeof(message) != 'string') {
      message = toString(message);
    }

    // For event-driven tests, output may come after the test has finished.
    // Display this in a special way to assist debugging.
    if (from_completed_test) {
      color = 'orange';
      message = 'completed test: ' + message;
    }

    this.logLocal(message, color);
    rpcCall('TestLog', {message: message});
  }

  this.log = function(test_name, message, from_completed_test) {
    if (message == undefined) {
      // This is a log message that is not assosiated with a test.
      // What we though was the test name is actually the message.
      this._log(test_name);
    } else {
      if (typeof(message) != 'string') {
        message = toString(message);
      }
      var full_message = '[' + test_name + ' LOG] ' + message;
      this._log(full_message, 'black', from_completed_test);
    }
  }

  this.fail = function(test_name, message, from_completed_test) {
    this.num_failed += 1;
    this.visualError();
    var full_message = '[' + test_name + ' FAIL] ' + message
    this._log(full_message, 'red', from_completed_test);
  }

  this.exception = function(test_name, err, from_completed_test) {
    this.num_errors += 1;
    this.visualError();
    var message = exceptionToLogText(err);
    var full_message = '[' + test_name + ' EXCEPTION] ' + message;
    this._log(full_message, 'purple', from_completed_test);
  }

  this.pass = function(test_name, from_completed_test) {
    this.num_passed += 1;
    var full_message = '[' + test_name + ' PASS]';
    this._log(full_message, 'green', from_completed_test);
  }

  this.blankLine = function() {
    this._log('');
  }

  // Allows users to log time data that will be parsed and re-logged
  // for chrome perf-bot graphs / performance regression testing.
  // See: native_client/tools/process_perf_output.py
  this.logTimeData = function(event, timeMS) {
    this.log('NaClPerf [' + event + '] ' + timeMS + ' millisecs');
  }

  this.visualError = function() {
    // Changing the color is defered until testing is done
    this.ever_failed = true;
  }

  this.logLineLocal = function(text, color) {
    text = text.replace(/\s+$/, '');
    if (text == '') {
      this.localOutput.appendChild(document.createElement('br'));
    } else {
      var mNode = document.createTextNode(text);
      var div = document.createElement('div');
      // Preserve whitespace formatting.
      div.style['white-space'] = 'pre';
      if (color != undefined) {
        div.style.color = color;
      }
      div.appendChild(mNode);
      this.localOutput.appendChild(div);
    }
  }

  this.logLocal = function(message, color) {
    var lines = message.split('\n');
    for (var i = 0; i < lines.length; i++) {
      this.logLineLocal(lines[i], color);
    }
  }

  // Create a place in the page to output test results
  this.localOutput = document.createElement('div');
  this.localOutput.id = 'testresults';
  this.localOutput.style.border = '2px solid #0000FF';
  this.localOutput.style.padding = '10px';
  document.body.appendChild(this.localOutput);
}


//
// BEGIN functions for testing
//


function fail(message, info, test_status) {
  var parts = [];
  if (message != undefined) {
    parts.push(message);
  }
  if (info != undefined) {
    parts.push('(' + info + ')');
  }
  var full_message = parts.join(' ');

  if (test_status !== undefined) {
    // New-style test
    test_status.fail(full_message);
  } else {
    // Old-style test
    throw {type: 'test_fail', message: full_message};
  }
}


function assert_(condition, message, test_status) {
  if (!condition) {
    fail(message, toString(condition), test_status);
  }
}


// This is accepted best practice for checking if an object is an array.
function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]';
}


function toString(obj) {
  if (typeof(obj) == 'string') {
    return '\'' + obj + '\'';
  }
  try {
    return obj.toString();
  } catch (err) {
    try {
      // Arrays should do this automatically, but there is a known bug where
      // NaCl gets array types wrong.  .toString will fail on these objects.
      return obj.join(',');
    } catch (err) {
      if (obj == undefined) {
        return 'undefined';
      } else {
        // There is no way to create a textual representation of this object.
        return '[UNPRINTABLE]';
      }
    }
  }
}


// Old-style, but new-style tests use it indirectly.
// (The use of the "test" parameter indicates a new-style test.  This is a
// temporary hack to avoid code duplication.)
function assertEqual(a, b, message, test_status) {
  if (isArray(a) && isArray(b)) {
    assertArraysEqual(a, b, message, test_status);
  } else if (a !== b) {
    fail(message, toString(a) + ' != ' + toString(b), test_status);
  }
}


// Old-style, but new-style tests use it indirectly.
// (The use of the "test" parameter indicates a new-style test.  This is a
// temporary hack to avoid code duplication.)
function assertArraysEqual(a, b, message, test_status) {
  var dofail = function() {
    fail(message, toString(a) + ' != ' + toString(b), test_status);
  }
  if (a.length != b.length) {
    dofail();
  }
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      dofail();
    }
  }
}


// Ideally there'd be some way to identify what exception was thrown, but JS
// exceptions are fairly ad-hoc.
// TODO(ncbray) allow manual validation of exception types?
function assertRaises(func, message, test_status) {
  try {
    func();
  } catch (err) {
    return;
  }
  fail(message, 'did not raise', test_status);
}


//
// END functions for testing
//


function haltAsyncTest() {
  throw {type: 'test_halt'};
}


function begins_with(s, prefix) {
  if (s.length >= prefix.length) {
    return s.substr(0, prefix.length) == prefix;
  } else {
    return false;
  }
}


function ends_with(s, suffix) {
  if (s.length >= suffix.length) {
    return s.substr(s.length - suffix.length, suffix.length) == suffix;
  } else {
    return false;
  }
}


function embed_name(embed) {
  if (embed.name != undefined) {
    if (embed.id != undefined) {
      return embed.name + ' / ' + embed.id;
    } else {
      return embed.name;
    }
  } else if (embed.id != undefined) {
    return embed.id;
  } else {
    return '[no name]';
  }
}


// Webkit Bug Workaround
// THIS SHOULD BE REMOVED WHEN Webkit IS FIXED
// http://code.google.com/p/nativeclient/issues/detail?id=2428
// http://code.google.com/p/chromium/issues/detail?id=103588

function ForcePluginLoadOnTimeout(elem, tester, timeout) {
  tester.log('Registering ForcePluginLoadOnTimeout ' +
             '(Bugs: NaCl 2428, Chrome 103588)');

  var started_loading = elem.readyState !== undefined;

  // Remember that the plugin started loading - it may be unloaded by the time
  // the callback fires.
  elem.addEventListener('load', function() {
    started_loading = true;
  }, true);

  // Check that the plugin has at least started to load after "timeout" seconds,
  // otherwise reload the page.
  setTimeout(function() {
    if (!started_loading) {
      ForceNaClPluginReload(elem, tester);
    }
  }, timeout);
}

function ForceNaClPluginReload(elem, tester) {
  if (elem.readyState === undefined) {
    tester.log('WARNING: WebKit plugin-not-loading error detected; reloading.');
    window.location.reload();
  }
}

function NaClWaiter(body_element) {
  // Work around how JS binds 'this'
  var this_ = this;
  var embedsToWaitFor = [];
  // embedsLoaded contains list of embeds that have dispatched the
  // 'loadend' progress event.
  this.embedsLoaded = [];

  this.is_loaded = function(embed) {
    for (var i = 0; i < this_.embedsLoaded.length; ++i) {
      if (this_.embedsLoaded[i] === embed) {
        return true;
      }
    }
    return (embed.readyState == 4) && !this_.has_errored(embed) ||
        (embed.readState == 'complete' && e.instance);
  }

  this.has_errored = function(embed) {
    var msg = embed.lastError;
    return embed.lastError != undefined && embed.lastError != '';
  }

  var eventListener = function(e) {
    if (e.type == 'loadend') {
      this_.embedsLoaded.push(e.target);
    }
  }

  // If an argument was passed, it is the body element for registering
  // event listeners for the 'loadend' event type.
  if (body_element != undefined) {
    body_element.addEventListener('loadend', eventListener, true);
  }

  // Takes an arbitrary number of arguments.
  this.waitFor = function() {
    for (var i = 0; i< arguments.length; i++) {
      var e = arguments[i];
      embedsToWaitFor.push(e);
      e.addEventListener('loadend', eventListener, true);
    }
  }

  this.run = function(doneCallback, pingCallback) {
    this.doneCallback = doneCallback;
    this.pingCallback = pingCallback;

    // Wait for up to forty seconds for the nexes to load.
    // TODO(ncbray) use error handling mechanisms (when they are implemented)
    // rather than a timeout.
    this.totalWait = 0;
    this.maxTotalWait = 40000;
    this.retryWait = 10;
    this.waitForPlugins();
  }

  this.waitForPlugins = function() {
    var errored = [];
    var loaded = [];
    var waiting = [];

    for (var i = 0; i < embedsToWaitFor.length; i++) {
      try {
        var e = embedsToWaitFor[i];
        if (this.has_errored(e)) {
          errored.push(e);
        } else if (this.is_loaded(e)) {
          loaded.push(e);
        } else {
          waiting.push(e);
        }
      } catch(err) {
        // If the module is badly horked, touching lastError, etc, may except.
        errored.push(e);
      }
    }

    this.totalWait += this.retryWait;

    if (waiting.length == 0) {
      this.doneCallback(loaded, errored);
    } else if (this.totalWait >= this.maxTotalWait) {
      // Timeouts are considered errors.
      this.doneCallback(loaded, errored.concat(waiting));
    } else {
      setTimeout(function() { this_.waitForPlugins(); }, this.retryWait);
      // Capped exponential backoff
      this.retryWait += this.retryWait/2;
      // Paranoid: does setTimeout like floating point numbers?
      this.retryWait = Math.round(this.retryWait);
      if (this.retryWait > 100)
        this.retryWait = 100;
      // Prevent the server from thinking the test has died.
      if (this.pingCallback)
        this.pingCallback();
    }
  }
}


function logLoadStatus(rpc, load_errors_are_test_errors, loaded, waiting) {
  for (var i = 0; i < loaded.length; i++) {
    rpc.log(embed_name(loaded[i]) + ' loaded');
  }
  // Be careful when interacting with horked nexes.
  var getCarefully = function (callback) {
    try {
      return callback();
    } catch (err) {
      return '<exception>';
    }
  }

  var errored = false;
  for (var j = 0; j < waiting.length; j++) {
    // Workaround for WebKit layout bug that caused the NaCl plugin to not
    // load.  If we see that the plugin is not loaded after a timeout, we
    // forcibly reload the page, thereby triggering layout.  Re-running
    // layout should make WebKit instantiate the plugin.  NB: this could
    // make the JavaScript-based code go into an infinite loop if the
    // WebKit bug becomes deterministic or the NaCl plugin fails after
    // loading, but the browser_tester.py code will timeout the test.
    //
    // http://code.google.com/p/nativeclient/issues/detail?id=2428
    //
    /*
    if (waiting[j].readyState == undefined) {
      // alert('Woot');  // -- for manual debugging
      rpc.log('WARNING: WebKit plugin-not-loading error detected; reloading.');
      window.location.reload();
      throw "reload NOW";
    }
    */
    var name = getCarefully(function(){
        return embed_name(waiting[j]);
      });
    var ready = getCarefully(function(){
        var readyStateString =
        ['UNSENT', 'OPENED', 'HEADERS_RECEIVED', 'LOADING', 'DONE'];
        // An undefined index value will return and undefined result.
        return readyStateString[waiting[j].readyState];
      });
    var last = getCarefully(function(){
        return toString(waiting[j].lastError);
      });
    var msg = (name + ' did not load. Status: ' + ready + ' / ' + last);
    if (load_errors_are_test_errors) {
      rpc.client_error(msg);
      errored = true;
    } else {
      rpc.log(msg);
    }
  }
  return errored;
}


// Contains the state for a single test.
function TestStatus(tester, name, async) {
  // Work around how JS binds 'this'
  var this_ = this;
  this.tester = tester;
  this.name = name;
  this.async = async;
  this.running = true;

  this.log = function(message) {
    this.tester.rpc.log(this.name, toString(message), !this.running);
  }

  this.getNumResources = function() {
    if (window.resources) {
      return resources.getNumResources();
    } else {
      return 0;
    }
  }

  this.getResourceInfo = function() {
    if (window.resources) {
      return resources.getResourceTypeHistogram();
    } else {
      return {};
    }
  }

  this.initial = this.getNumResources();

  this.pass = function() {
    var current = this.getNumResources();
    if (this.initial != current) {
      this.fail('Resource leak detected: ' + current + ' != ' + this.initial + '  / ' + JSON.stringify(this.getResourceInfo()));
      return;
    }

    // TODO raise if not running.
    this.tester.rpc.pass(this.name, !this.running);
    this._done();
    haltAsyncTest();
  }

  this.fail = function(message) {
    this.tester.rpc.fail(this.name, message, !this.running);
    this._done();
    haltAsyncTest();
  }

  this._done = function() {
    if (this.running) {
      this.running = false;
      this.tester.testDone(this);
    }
  }

  this.assert = function(condition, message) {
    assert_(condition, message, this);
  }

  this.assertEqual = function(a, b, message) {
    assertEqual(a, b, message, this);
  }

  this.callbackWrapper = function(callback, args) {
    // A stale callback?
    if (!this.running)
      return;

    if (args === undefined)
      args = [];

    try {
      callback.apply(undefined, args);
    } catch (err) {
      if (typeof err == 'object' && 'type' in err) {
        if (err.type == 'test_halt') {
          // New-style test
          // If we get this exception, we can assume any callbacks or next
          // tests have already been scheduled.
          return;
        } else if (err.type == 'test_fail') {
          // Old-style test
          // A special exception that terminates the test with a failure
          this.tester.rpc.fail(this.name, err.message, !this.running);
          this._done();
          return;
        }
      }
      // This is not a special type of exception, it is an error.
      this.tester.rpc.exception(this.name, err, !this.running);
      this._done();
      return;
    }

    // A normal exit.  Should we move on to the next test?
    // Async tests do not move on without an explicit pass.
    if (!this.async) {
      this.tester.rpc.pass(this.name);
      this._done();
    }
  }

  // Async callbacks should be wrapped so the tester can catch unexpected
  // exceptions.
  this.wrap = function(callback) {
    return function() {
      this_.callbackWrapper(callback, arguments);
    };
  }

  this.setTimeout = function(callback, time) {
    setTimeout(this.wrap(callback), time);
  }

  this.waitForCallback = function(callbackName, expectedCalls) {
    this.log('Waiting for ' + expectedCalls + ' invocations of callback: '
               + callbackName);
    var gotCallbacks = 0;

    // Deliberately global - this is what the nexe expects.
    // TODO(ncbray): consider returning this function, so the test has more
    // flexibility. For example, in the test one could count to N
    // using a different callback before calling _this_ callback, and
    // continuing the test. Also, consider calling user-supplied callback
    // when done waiting.
    window[callbackName] = this.wrap(function() {
      ++gotCallbacks;
      this_.log('Received callback ' + gotCallbacks);
      if (gotCallbacks == expectedCalls) {
        this_.log("Done waiting");
        this_.pass();
      } else {
        // HACK
        haltAsyncTest();
      }
    });

    // HACK if this function is used in a non-async test, make sure we don't
    // spuriously pass.  Throwing this exception forces us to behave like an
    // async test.
    haltAsyncTest();
  }

  // This function takes an array of messages and asserts that the nexe
  // calls PostMessage with each of these messages, in order.
  // Arguments:
  //   plugin - The DOM object for the NaCl plugin
  //   messages - An array of expected responses
  //   callback - An optional callback function that takes the current message
  //              string as an argument
  this.expectMessageSequence = function(plugin, messages, callback) {
    this.assert(messages.length > 0, 'Must provide at least one message');
    var local_messages = messages.slice();
    var listener = function(message) {
      if (message.data.indexOf('@:') == 0) {
        // skip debug messages
        this_.log('DEBUG: ' + message.data.substr(2));
      } else {
        this_.assertEqual(message.data, local_messages.shift());
        if (callback !== undefined) {
          callback(message.data);
        }
      }
      if (local_messages.length == 0) {
        this_.pass();
      } else {
        this_.expectEvent(plugin, 'message', listener);
      }
    }
    this.expectEvent(plugin, 'message', listener);
  }

  this.expectEvent = function(src, event_type, listener) {
    var wrapper = this.wrap(function(e) {
      src.removeEventListener(event_type, wrapper, false);
      listener(e);
    });
    src.addEventListener(event_type, wrapper, false);
  }
}


function Tester(body_element) {
  // Work around how JS binds 'this'
  var this_ = this;
  // The tests being run.
  var tests = [];
  this.rpc = new RPCWrapper();
  this.waiter = new NaClWaiter(body_element);

  var load_errors_are_test_errors = true;

  var parallel = false;

  //
  // BEGIN public interface
  //

  this.loadErrorsAreOK = function() {
    load_errors_are_test_errors = false;
  }

  this.log = function(message) {
    this.rpc.log(message);
  }

  // If this kind of test exits cleanly, it passes
  this.addTest = function(name, testFunction) {
    tests.push({name: name, callback: testFunction, async: false});
  }

  // This kind of test does not pass until "pass" is explicitly called.
  this.addAsyncTest = function(name, testFunction) {
    tests.push({name: name, callback: testFunction, async: true});
  }

  this.run = function() {
    this.rpc.startup();
    this.startHeartbeat();
    this.waiter.run(
      function(loaded, waiting) {
        var errored = logLoadStatus(this_.rpc, load_errors_are_test_errors,
                                    loaded, waiting);
        if (errored) {
          this_.rpc.blankLine();
          this_.rpc.log('A nexe load error occured, aborting testing.');
          this_._done();
        } else {
          this_.startTesting();
        }
      },
      function() {
        this_.rpc.ping();
      }
    );
  }

  this.runParallel = function() {
    parallel = true;
    this.run();
  }

  // Takes an arbitrary number of arguments.
  this.waitFor = function() {
    for (var i = 0; i< arguments.length; i++) {
      this.waiter.waitFor(arguments[i]);
    }
  }

  //
  // END public interface
  //

  this.startHeartbeat = function() {
    var rpc = this.rpc;
    var heartbeat = function() {
      rpc.heartbeat();
      setTimeout(heartbeat, 500);
    }
    heartbeat();
  }

  this.launchTest = function(testIndex) {
    var testDecl = tests[testIndex];
    var currentTest = new TestStatus(this, testDecl.name, testDecl.async);
    setTimeout(currentTest.wrap(function() {
      this_.rpc.blankLine();
      this_.rpc.begin(currentTest.name);
      testDecl.callback(currentTest);
    }), 0);
  }

  this._done = function() {
    this.rpc.blankLine();
    this.rpc.shutdown();
  }

  this.startTesting = function() {
    if (tests.length == 0) {
      // No tests specified.
      this._done();
      return;
    }

    this.testCount = 0;
    if (parallel) {
      // Launch all tests.
      for (var i = 0; i < tests.length; i++) {
        this.launchTest(i);
      }
    } else {
      // Launch the first test.
      this.launchTest(0);
    }
  }

  this.testDone = function(test) {
    this.testCount += 1;
    if (this.testCount < tests.length) {
      if (!parallel) {
        // Move on to the next test if they're being run one at a time.
        this.launchTest(this.testCount);
      }
    } else {
      this._done();
    }
  }
}
