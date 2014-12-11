/**
 * @license Knockout.Punches
 * Enhanced binding syntaxes for Knockout 3+
 * (c) Michael Best
 * License: MIT (http://www.opensource.org/licenses/mit-license.php)
 * Version 0.3.0
 */
(function (factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['knockout'], factory);
    } else {
        // Browser globals
        factory(ko);
    }
}(function(ko) {
// Add a preprocess function to a binding handler.
function setBindingPreprocessor(bindingKeyOrHandler, preprocessFn) {
    return chainPreprocessor(getOrCreateHandler(bindingKeyOrHandler), 'preprocess', preprocessFn);
}

// These utility functions are separated out because they're also used by
// preprocessBindingProperty

// Get the binding handler or create a new, empty one
function getOrCreateHandler(bindingKeyOrHandler) {
    return typeof bindingKeyOrHandler === 'object' ? bindingKeyOrHandler :
        (ko.getBindingHandler(bindingKeyOrHandler) || (ko.bindingHandlers[bindingKeyOrHandler] = {}));
}
// Add a preprocess function
function chainPreprocessor(obj, prop, fn) {
    if (obj[prop]) {
        // If the handler already has a preprocess function, chain the new
        // one after the existing one. If the previous function in the chain
        // returns a falsy value (to remove the binding), the chain ends. This
        // method allows each function to modify and return the binding value.
        var previousFn = obj[prop];
        obj[prop] = function(value, binding, addBinding) {
            value = previousFn.call(this, value, binding, addBinding);
            if (value)
                return fn.call(this, value, binding, addBinding);
        };
    } else {
        obj[prop] = fn;
    }
    return obj;
}

// Add a preprocessNode function to the binding provider. If a
// function already exists, chain the new one after it. This calls
// each function in the chain until one modifies the node. This
// method allows only one function to modify the node.
function setNodePreprocessor(preprocessFn) {
    var provider = ko.bindingProvider.instance;
    if (provider.preprocessNode) {
        var previousPreprocessFn = provider.preprocessNode;
        provider.preprocessNode = function(node) {
            var newNodes = previousPreprocessFn.call(this, node);
            if (!newNodes)
                newNodes = preprocessFn.call(this, node);
            return newNodes;
        };
    } else {
        provider.preprocessNode = preprocessFn;
    }
}

function setBindingHandlerCreator(matchRegex, callbackFn) {
    var oldGetHandler = ko.getBindingHandler;
    ko.getBindingHandler = function(bindingKey) {
        var match;
        return oldGetHandler(bindingKey) || ((match = bindingKey.match(matchRegex)) && callbackFn(match, bindingKey));
    };
}

// Create "punches" object and export utility functions
var ko_punches = ko.punches = {
    utils: {
        setBindingPreprocessor: setBindingPreprocessor,
        setNodePreprocessor: setNodePreprocessor,
        setBindingHandlerCreator: setBindingHandlerCreator
    }
};

ko_punches.enableAll = function () {
    // Enable interpolation markup
    enableInterpolationMarkup();
    enableAttributeInterpolationMarkup();

    // Enable auto-namspacing of attr, css, event, and style
    enableAutoNamespacedSyntax('attr');
    enableAutoNamespacedSyntax('css');
    enableAutoNamespacedSyntax('event');
    enableAutoNamespacedSyntax('style');

    // Enable filter syntax for text, html, and attr
    enableTextFilter('text');
    enableTextFilter('html');
    setDefaultNamespacedBindingPreprocessor('attr', filterPreprocessor);

    // Enable wrapped callbacks for click, submit, event, optionsAfterRender, and template options
    enableWrappedCallback('click');
    enableWrappedCallback('submit');
    enableWrappedCallback('optionsAfterRender');
    setDefaultNamespacedBindingPreprocessor('event', wrappedCallbackPreprocessor);
    setBindingPropertyPreprocessor('template', 'beforeRemove', wrappedCallbackPreprocessor);
    setBindingPropertyPreprocessor('template', 'afterAdd', wrappedCallbackPreprocessor);
    setBindingPropertyPreprocessor('template', 'afterRender', wrappedCallbackPreprocessor);
};
// Convert input in the form of `expression | filter1 | filter2:arg1:arg2` to a function call format
// with filters accessed as ko.filters.filter1, etc.
function filterPreprocessor(input) {
    // Check if the input contains any | characters; if not, just return
    if (input.indexOf('|') === -1)
        return input;

    // Split the input into tokens, in which | and : are individual tokens, quoted strings are ignored, and all tokens are space-trimmed
    var tokens = input.match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\|\||[|:]|[^\s|:"'][^|:"']*[^\s|:"']|[^\s|:"']/g);
    if (tokens && tokens.length > 1) {
        // Append a line so that we don't need a separate code block to deal with the last item
        tokens.push('|');
        input = tokens[0];
        var lastToken, token, inFilters = false, nextIsFilter = false;
        for (var i = 1, token; token = tokens[i]; ++i) {
            if (token === '|') {
                if (inFilters) {
                    if (lastToken === ':')
                        input += "undefined";
                    input += ')';
                }
                nextIsFilter = true;
                inFilters = true;
            } else {
                if (nextIsFilter) {
                    input = "ko.filters['" + token + "'](" + input;
                } else if (inFilters && token === ':') {
                    if (lastToken === ':')
                        input += "undefined";
                    input += ",";
                } else {
                    input += token;
                }
                nextIsFilter = false;
            }
            lastToken = token;
        }
    }
    return input;
}

// Set the filter preprocessor for a specific binding
function enableTextFilter(bindingKeyOrHandler) {
    setBindingPreprocessor(bindingKeyOrHandler, filterPreprocessor);
}

var filters = {};

// Convert value to uppercase
filters.uppercase = function(value) {
    return String.prototype.toUpperCase.call(value);
};

// Convert value to lowercase
filters.lowercase = function(value) {
    return String.prototype.toLowerCase.call(value);
};

// Return default value if the input value is blank or null
filters['default'] = function(value, defaultValue) {
    return (value === '' || value == null) ? defaultValue : value;
};

// Return the value with the search string replaced with the replacement string
filters.replace = function(value, search, replace) {
    return String.prototype.replace.call(value, search, replace);
};

filters.fit = function(value, length, replacement, trimWhere) {
    if (length && ('' + value).length > length) {
        replacement = '' + (replacement || '...');
        length = length - replacement.length;
        value = '' + value;
        switch (trimWhere) {
            case 'left':
                return replacement + value.slice(-length);
            case 'middle':
                var leftLen = Math.ceil(length / 2);
                return value.substr(0, leftLen) + replacement + value.slice(leftLen-length);
            default:
                return value.substr(0, length) + replacement;
        }
    } else {
        return value;
    }
};

// Convert a model object to JSON
filters.json = function(rootObject, space, replacer) {     // replacer and space are optional
    return ko.toJSON(rootObject, replacer, space);
};

// Format a number using the browser's toLocaleString
filters.number = function(value) {
    return (+value).toLocaleString();
};

// Export the filters object for general access
ko.filters = filters;

// Export the preprocessor functions
ko_punches.textFilter = {
    preprocessor: filterPreprocessor,
    enableForBinding: enableTextFilter
};
// Support dynamically-created, namespaced bindings. The binding key syntax is
// "namespace.binding". Within a certain namespace, we can dynamically create the
// handler for any binding. This is particularly useful for bindings that work
// the same way, but just set a different named value, such as for element
// attributes or CSS classes.
var namespacedBindingMatch = /([^\.]+)\.(.+)/, namespaceDivider = '.';
setBindingHandlerCreator(namespacedBindingMatch, function (match, bindingKey) {
    var namespace = match[1],
        namespaceHandler = ko.bindingHandlers[namespace];
    if (namespaceHandler) {
        var bindingName = match[2],
            handlerFn = namespaceHandler.getNamespacedHandler || defaultGetNamespacedHandler,
            handler = handlerFn.call(namespaceHandler, bindingName, namespace, bindingKey);
        ko.bindingHandlers[bindingKey] = handler;
        return handler;
    }
});

// Knockout's built-in bindings "attr", "event", "css" and "style" include the idea of
// namespaces, representing it using a single binding that takes an object map of names
// to values. This default handler translates a binding of "namespacedName: value"
// to "namespace: {name: value}" to automatically support those built-in bindings.
function defaultGetNamespacedHandler(name, namespace, namespacedName) {
    var handler = ko.utils.extend({}, this);
    function setHandlerFunction(funcName) {
        if (handler[funcName]) {
            handler[funcName] = function(element, valueAccessor) {
                function subValueAccessor() {
                    var result = {};
                    result[name] = valueAccessor();
                    return result;
                }
                var args = Array.prototype.slice.call(arguments, 0);
                args[1] = subValueAccessor;
                return ko.bindingHandlers[namespace][funcName].apply(this, args);
            };
        }
    }
    // Set new init and update functions that wrap the originals
    setHandlerFunction('init');
    setHandlerFunction('update');
    // Clear any preprocess function since preprocessing of the new binding would need to be different
    if (handler.preprocess)
        handler.preprocess = null;
    if (ko.virtualElements.allowedBindings[namespace])
        ko.virtualElements.allowedBindings[namespacedName] = true;
    return handler;
}

// Sets a preprocess function for every generated namespace.x binding. This can
// be called multiple times for the same binding, and the preprocess functions will
// be chained. If the binding has a custom getNamespacedHandler method, make sure that
// it's set before this function is used.
function setDefaultNamespacedBindingPreprocessor(namespace, preprocessFn) {
    var handler = ko.getBindingHandler(namespace);
    if (handler) {
        var previousHandlerFn = handler.getNamespacedHandler || defaultGetNamespacedHandler;
        handler.getNamespacedHandler = function() {
            return setBindingPreprocessor(previousHandlerFn.apply(this, arguments), preprocessFn);
        };
    }
}

function autoNamespacedPreprocessor(value, binding, addBinding) {
    if (value.charAt(0) !== "{")
        return value;

    // Handle two-level binding specified as "binding: {key: value}" by parsing inner
    // object and converting to "binding.key: value"
    var subBindings = ko.expressionRewriting.parseObjectLiteral(value);
    ko.utils.arrayForEach(subBindings, function(keyValue) {
        addBinding(binding + namespaceDivider + keyValue.key, keyValue.value);
    });
}

// Set the namespaced preprocessor for a specific binding
function enableAutoNamespacedSyntax(bindingKeyOrHandler) {
    setBindingPreprocessor(bindingKeyOrHandler, autoNamespacedPreprocessor);
}

// Export the preprocessor functions
ko_punches.namespacedBinding = {
    defaultGetHandler: defaultGetNamespacedHandler,
    setDefaultBindingPreprocessor: setDefaultNamespacedBindingPreprocessor,
    preprocessor: autoNamespacedPreprocessor,
    enableForBinding: enableAutoNamespacedSyntax
};
// Wrap a callback function in an anonymous function so that it is called with the appropriate
// "this" value.
function wrappedCallbackPreprocessor(val) {
    // Matches either an isolated identifier or something ending with a property accessor
    if (/^([$_a-z][$\w]*|.+(\.\s*[$_a-z][$\w]*|\[.+\]))$/i.test(val)) {
        return 'function(_x,_y,_z){return(' + val + ')(_x,_y,_z);}';
    } else {
        return val;
    }
}

// Set the wrappedCallback preprocessor for a specific binding
function enableWrappedCallback(bindingKeyOrHandler) {
    setBindingPreprocessor(bindingKeyOrHandler, wrappedCallbackPreprocessor);
}

// Export the preprocessor functions
ko_punches.wrappedCallback = {
    preprocessor: wrappedCallbackPreprocessor,
    enableForBinding: enableWrappedCallback
};
// Attach a preprocess function to a specific property of a binding. This allows you to
// preprocess binding "options" using the same preprocess functions that work for bindings.
function setBindingPropertyPreprocessor(bindingKeyOrHandler, property, preprocessFn) {
    var handler = getOrCreateHandler(bindingKeyOrHandler);
    if (!handler._propertyPreprocessors) {
        // Initialize the binding preprocessor
        chainPreprocessor(handler, 'preprocess', propertyPreprocessor);
        handler._propertyPreprocessors = {};
    }
    // Add the property preprocess function
    chainPreprocessor(handler._propertyPreprocessors, property, preprocessFn);
}

// In order to preprocess a binding property, we have to preprocess the binding itself.
// This preprocess function splits up the binding value and runs each property's preprocess
// function if it's set.
function propertyPreprocessor(value, binding, addBinding) {
    if (value.charAt(0) !== "{")
        return value;

    var subBindings = ko.expressionRewriting.parseObjectLiteral(value),
        resultStrings = [],
        propertyPreprocessors = this._propertyPreprocessors || {};
    ko.utils.arrayForEach(subBindings, function(keyValue) {
        var prop = keyValue.key, propVal = keyValue.value;
        if (propertyPreprocessors[prop]) {
            propVal = propertyPreprocessors[prop](propVal, prop, addBinding);
        }
        if (propVal) {
            resultStrings.push("'" + prop + "':" + propVal);
        }
    });
    return "{" + resultStrings.join(",") + "}";
}

// Export the preprocessor functions
ko_punches.preprocessBindingProperty = {
    setPreprocessor: setBindingPropertyPreprocessor
};
// Wrap an expression in an anonymous function so that it is called when the event happens
function makeExpressionCallbackPreprocessor(args) {
    return function expressionCallbackPreprocessor(val) {
        return 'function('+args+'){return(' + val + ');}';
    };
}

var eventExpressionPreprocessor = makeExpressionCallbackPreprocessor("$data,$event");

// Set the expressionCallback preprocessor for a specific binding
function enableExpressionCallback(bindingKeyOrHandler, args) {
    var args = Array.prototype.slice.call(arguments, 1).join();
    setBindingPreprocessor(bindingKeyOrHandler, makeExpressionCallbackPreprocessor(args));
}

// Export the preprocessor functions
ko_punches.expressionCallback = {
    makePreprocessor: makeExpressionCallbackPreprocessor,
    eventPreprocessor: eventExpressionPreprocessor,
    enableForBinding: enableExpressionCallback
};

// Create an "on" namespace for events to use the expression method
ko.bindingHandlers.on = {
    getNamespacedHandler: function(eventName) {
        var handler = ko.getBindingHandler('event' + namespaceDivider + eventName);
        return setBindingPreprocessor(handler, eventExpressionPreprocessor);
    }
};
// Performance comparison at http://jsperf.com/markup-interpolation-comparison
function parseInterpolationMarkup(textToParse, outerTextCallback, expressionCallback) {
    function innerParse(text) {
        var innerMatch = text.match(/^([\s\S]*)}}([\s\S]*?)\{\{([\s\S]*)$/);
        if (innerMatch) {
            innerParse(innerMatch[1]);
            outerTextCallback(innerMatch[2]);
            expressionCallback(innerMatch[3]);
        } else {
            expressionCallback(text);
        }
    }
    var outerMatch = textToParse.match(/^([\s\S]*?)\{\{([\s\S]*)}}([\s\S]*)$/);
    if (outerMatch) {
        outerTextCallback(outerMatch[1]);
        innerParse(outerMatch[2]);
        outerTextCallback(outerMatch[3]);
    }
}

function trim(string) {
    return string == null ? '' :
        string.trim ?
            string.trim() :
            string.toString().replace(/^[\s\xa0]+|[\s\xa0]+$/g, '');
}

function interpolationMarkupPreprocessor(node) {
    // only needs to work with text nodes
    if (node.nodeType === 3 && node.nodeValue && node.nodeValue.indexOf('{{') !== -1) {
        var nodes = [];
        function addTextNode(text) {
            if (text)
                nodes.push(document.createTextNode(text));
        }
        function wrapExpr(expressionText) {
            if (expressionText)
                nodes.push.apply(nodes, ko_punches_interpolationMarkup.wrapExpression(trim(expressionText), node));
        }
        parseInterpolationMarkup(node.nodeValue, addTextNode, wrapExpr)

        if (nodes.length) {
            if (node.parentNode) {
                for (var i = 0, n = nodes.length, parent = node.parentNode; i < n; ++i) {
                    parent.insertBefore(nodes[i], node);
                }
                parent.removeChild(node);
            }
            return nodes;
        }
    }
}

if (!ko.virtualElements.allowedBindings.html) {
    // Virtual html binding
    // SO Question: http://stackoverflow.com/a/15348139
    var overridden = ko.bindingHandlers.html.update;
    ko.bindingHandlers.html.update = function (element, valueAccessor) {
        if (element.nodeType === 8) {
            var html = ko.utils.unwrapObservable(valueAccessor());
            if (html != null) {
                var parsedNodes = ko.utils.parseHtmlFragment('' + html);
                ko.virtualElements.setDomNodeChildren(element, parsedNodes);
            } else {
                ko.virtualElements.emptyNode(element);
            }
        } else {
            overridden(element, valueAccessor);
        }
    };
    ko.virtualElements.allowedBindings.html = true;
}

function wrapExpression(expressionText, node) {
    var ownerDocument = node ? node.ownerDocument : document,
        closeComment = ownerDocument.createComment("/ko"),
        firstChar = expressionText[0];

    if (firstChar === '#') {
        return [ ownerDocument.createComment("ko " + expressionText.slice(1)) ];
    } else if (firstChar === '/') {
        return [ closeComment ];
    } else if (firstChar === '{' && expressionText[expressionText.length - 1] === '}') {
        return [ ownerDocument.createComment("ko html:" + expressionText.slice(1, -1)), closeComment ];
    } else {
        return [ ownerDocument.createComment("ko text:" + expressionText), closeComment ];
    }
};

function enableInterpolationMarkup() {
    setNodePreprocessor(ko_punches_interpolationMarkup.preprocessor);
}

// Export the preprocessor functions
var ko_punches_interpolationMarkup = ko_punches.interpolationMarkup = {
    preprocessor: interpolationMarkupPreprocessor,
    enable: enableInterpolationMarkup,
    wrapExpression: wrapExpression
};


var dataBind = 'data-bind';
function attributeInterpolationMarkerPreprocessor(node) {
    if (node.nodeType === 1 && node.attributes.length) {
        var dataBindAttribute = node.getAttribute(dataBind);
        for (var attrs = node.attributes, i = attrs.length-1; i >= 0; --i) {
            var attr = attrs[i];
            if (attr.specified && attr.name != dataBind && attr.value.indexOf('{{') !== -1) {
                var parts = [], attrValue = '';
                function addText(text) {
                    if (text)
                        parts.push('"' + text.replace(/"/g, '\\"') + '"');
                }
                function addExpr(expressionText) {
                    if (expressionText) {
                        attrValue = expressionText;
                        parts.push('ko.unwrap(' + expressionText + ')');
                    }
                }
                parseInterpolationMarkup(attr.value, addText, addExpr);

                if (parts.length > 1) {
                    attrValue = '""+' + parts.join('+');
                }

                if (attrValue) {
                    var attrBinding = ko_punches_attributeInterpolationMarkup.attributeBinding(attr.name, attrValue, node) || attributeBinding(attr.name, attrValue, node);
                    if (!dataBindAttribute) {
                        dataBindAttribute = attrBinding
                    } else {
                        dataBindAttribute += ',' + attrBinding;
                    }
                    node.setAttribute(dataBind, dataBindAttribute);
                    node.removeAttributeNode(attr);
                }
            }
        }
    }
}

function attributeBinding(name, value, node) {
    if (ko.getBindingHandler(name)) {
        return name + ':' + value;
    } else {
        return 'attr.' + name + ':' + value;
    }
}

function enableAttributeInterpolationMarkup() {
    setNodePreprocessor(ko_punches_attributeInterpolationMarkup.preprocessor);
}

var ko_punches_attributeInterpolationMarkup = ko_punches.attributeInterpolationMarkup = {
    preprocessor: attributeInterpolationMarkerPreprocessor,
    enable: enableAttributeInterpolationMarkup,
    attributeBinding: attributeBinding
};
var durandalSyntax = {};

var lastIf = null;

function trim(string) {
    return string == null ? '' :
        string.trim ?
            string.trim() :
            string.toString().replace(/^[\s\xa0]+|[\s\xa0]+$/g, '');
}

var attributeBindingOriginal
  = ko.punches.attributeInterpolationMarkup.attributeBinding;

durandalSyntax.attributeBinding = function(name, value, node, bindAtt) {
  var matches = [];
  if(name == 'value'){
    return "value:" + value + ",valueUpdate:'keyup'";
  }
  else if(name == 'style'){
    return "attr.style: " + value;
  }
  else if(name == 'if' || name == 'repeat'){
    var isNgIf = name == 'if';
    var matches, ngRepeatAs = 'row';
    if(matches = value.match(/(.+?)\s+?as\s+?(\w+)/)){
      ngRepeatAs = matches[2];
      value = matches[1];
    }
    var ownerDocument = node ? node.ownerDocument : document,
    closeComment = ownerDocument.createComment("/ko"),
    openComment = ownerDocument.createComment(
      isNgIf ? "ko if:" + value :
      "ko foreach:{data:" + value + ",as:'" + ngRepeatAs + "'}"
    );
    node.parentNode.insertBefore(openComment, node);
    node.parentNode.insertBefore(closeComment, node.nextSibling);
    if(//false &&
       !isNgIf){
        node.parentNode.insertBefore(ownerDocument.createComment('ko with:$parent'), node);
        node.parentNode.insertBefore(ownerDocument.createComment('/ko'), node.nextSibling); // insertAfter
    }
    return isNgIf ? "with:$data" : "with:$data";
  }
//  else if(name == 'active'){
//    return "css:{'active':" + value + "}";
//  } 
  if(bindAtt){
    var attrName = name.replace(/-([a-z])/g, function(m) {
      return m[1].toUpperCase();
    });
    name = attrName;
//    if (ko.getBindingHandler(name)) {
//        return name + ':' + value;
//    } else {
//        return 'attr.' + name + ':' + value;
//    }
//    return attrName + ':' + value;
  }
  if(['optionsText', 'optionsValue', 'optionsCaption'].indexOf(name) !== -1){
    return name + ':' + value;
  }
  return attributeBindingOriginal(name, value, node);
};

var wrapExpressionOriginal = ko.punches.interpolationMarkup.wrapExpression;

durandalSyntax.wrapExpression = function(expressionText, node) {
    var ownerDocument = node ? node.ownerDocument : document,
        closeComment = ownerDocument.createComment("/ko"),
        firstChar = expressionText[0];

  if(expressionText == 'else' && lastIf){
    return [ closeComment, ownerDocument.createComment("ko ifnot:" + lastIf) ];
  }
  var controls = [
      ['each', 'foreach'],
      ['with', 'with'],
      ['if', 'if']
  ];


  if (firstChar === '#') {
    for (var i = 0; i < controls.length; i++) {
        var templateSyntax = controls[i][0];
        var koSyntax = controls[i][1];
        // {{#if true}} {{#each arr}} {{/each}} {{/if}}
        if (expressionText.indexOf(firstChar + templateSyntax) === 0) {
          expressionText = expressionText.replace(firstChar + templateSyntax, '');
          expressionText = trim(expressionText);
          if(templateSyntax == 'if'){
              lastIf = expressionText;
          }
          return [ ownerDocument.createComment("ko " + koSyntax
                                               + ":" + expressionText) ];
        }
        if (expressionText.indexOf('/' + templateSyntax) === 0) {
          if(templateSyntax == 'if'){
              lastIf = null;
          }
          return [ closeComment ];
        }
    }
  }

  return wrapExpressionOriginal(expressionText, node);
};

var attributePreprocessorOriginal
  = ko.punches.attributeInterpolationMarkup.preprocessor;

var dataBind = 'data-bind';
durandalSyntax.attributePreprocessor = function(node) {
  if (node.nodeType === 1 && node.attributes.length) {
    var dataBindAttribute = node.getAttribute(dataBind);
    var eventsAttrs = [];
		var bindAttrs = [];
    for (var attrs = node.attributes, i = attrs.length-1; i >= 0; --i) {
      var attr = attrs[i];
      if (!(attr.specified && attr.name != dataBind)) {
        continue;
      }

      var eventCb = attr.name.match(/^on-(.+)/);
      var bindAtt = attr.name.match(/^bind-(.+)/);
      if(!bindAtt){
        bindAtt = attr.name.match(/^\[(.+?)\]$/);
      }
      if(!eventCb){
        eventCb = attr.name.match(/^\((.+?)\)$/);
      }
      if(attr.name == 'if' || attr.name == 'repeat' || attr.name == 'active'){
        node.removeAttributeNode(attr);
        continue;
      }
      else if(eventCb){
          eventsAttrs.push(eventCb[1] + ': function($data,$event){ ' + attr.value + ' }');
          node.removeAttributeNode(attr);
      }
      else if (bindAtt) {
          var attrValue = attr.value;
          var attrName = bindAtt[1];

            if (attrValue) {
                var attrBinding =
                // ko.punches.attributeInterpolationMarkup
                //    .attributeBinding(attrName, attrValue, node)  || 
                durandalSyntax.attributeBinding(attrName, attrValue, node, true);
                if (!dataBindAttribute) {
                    dataBindAttribute = attrBinding
                } else {
                    dataBindAttribute += ',' + attrBinding;
                }
                node.setAttribute(dataBind, dataBindAttribute);
                node.removeAttributeNode(attr);
            }
        }
      }
      if(eventsAttrs.length){
        var eventBinding = 'event: {' + eventsAttrs.join(', ') + '}';
        if(!dataBindAttribute){
          dataBindAttribute = eventBinding;
        }
        else {
          dataBindAttribute += ',' + eventBinding;
        }
        node.setAttribute(dataBind, dataBindAttribute);
      }
    return attributePreprocessorOriginal(node);
  }
}

var interpolationPreprocessorOriginal = ko.punches.interpolationMarkup.preprocessor;

durandalSyntax.interpolationPreprocessor = function(node){
  var widgetName;
    if(node.localName){
      var localName = node.localName.toLowerCase();
      widgetName = localName.replace(/-([a-z])/g, function (g) { return g[1].toUpperCase(); });
    }
    if(widgetName && ko.getBindingHandler(widgetName)){
      var widgetSettings = '{', keyString;
      for(var i = 0; i < node.attributes.length; i++){
        var attr = node.attributes[i];
        var bindAtt = attr.name.match(/^bind-(.+)/);
        if(!bindAtt){
          bindAtt = attr.name.match(/^\[(.+?)\]$/);
        }
        if(bindAtt){
          keyString = bindAtt[1];
          keyString = keyString.replace(/-([a-z])/g, function (g) { return g[1].toUpperCase(); });
          widgetSettings += (i == 0 ? '' : ',') +
            keyString + ':' + attr.nodeValue;
        }
      }
      widgetSettings += '}';
      var element = document.createElement('div');
//      alert(widgetName + ': ' + widgetSettings);
      element.setAttribute('data-bind', widgetName + ': ' + widgetSettings);
//      alert(element.getAttribute('data-bind'));
      if (node.parentNode) {
        node.parentNode.insertBefore(element, node);
        node.parentNode.removeChild(node);
      }
      return [element];
    }
    return interpolationPreprocessorOriginal(node);
}

ko.punches.interpolationMarkup.wrapExpression
  = durandalSyntax.wrapExpression;
ko.punches.attributeInterpolationMarkup.attributeBinding
  = durandalSyntax.attributeBinding;

ko.punches.attributeInterpolationMarkup.preprocessor
  = durandalSyntax.attributePreprocessor;

ko.punches.interpolationMarkup.preprocessor
  = durandalSyntax.interpolationPreprocessor;
}));
