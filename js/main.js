/* ==========================================================================
   Nested Knockout.js Subscriptions
   http://stackoverflow.com/questions/13980753/how-to-subscribe-to-observable-in-observablearray
   ========================================================================== */

ko.observable.fn.subscribeArray = function (callbacks) {
    // Takes three callbacks, and calls them whenever an item is added, deleted or moved in the array.
    
    var add, del, move;
    if (typeof callbacks === "function") {
        add = callbacks;
    }
    else {
        add = callbacks.added; // (item, newIndex)
        del = callbacks.deleted; // (item, oldIndex)
        move = callbacks.moved; // (item, oldIndex, newIndex)
    }

    var self = this,
        lastValue = self().slice();
    return self.subscribe(function (newValue) {
        var editScript = ko.utils.compareArrays(lastValue, newValue);
        lastValue = newValue.slice();
        ko.utils.arrayForEach(editScript, function (editItem) {
            switch (editItem.status) {
                case 'added':
                    if (editItem.moved !== undefined) {
                        if (move) move(editItem.value, editItem.index, editITem.moved);
                    }
                    else {
                        if (add) add(editItem.value, editItem.index);
                    }
                    break;
                case 'deleted':
                    if (editItem.moved === undefined) {
                        if (del) del(editItem.value, editItem.index);
                    }
                    break;
            }
        });
    });
}

ko.observable.fn.select = function (selector) {
    // Takes one callback, and calls it whenever an item is added to the array. It expects the callback
    // to return a subscription, wich is disposed of when the item is removed.

    var self = this,
        value = self();
    if (value.length === undefined) {
        // Not an array. Do a normal subscription, and call the selector immediately.
        var sub = self.subscribe(selector);
        selector(value);
        return sub;
    }

    var childSubscriptions = ko.utils.arrayMap(value, selector),
        subscription = self.subscribeArray({
            'added': function (item, index) {
                var sub = selector(item);
                childSubscriptions.splice(index, 0, sub);
            },
            'deleted': function (item, index) {
                var sub = childSubscriptions[index];
                childSubscriptions.splice(index, 1);
                sub.dispose();
            },
            'moved': function (item, index, index2) {
                var sub = childSubscriptions[index];
                childSubscriptions.splice(index,1);
                childSubscriptions.splice(index2,0,sub);
            }
        }),
        originalDispose = subscription.dispose;
    subscription.dispose = function () {
        ko.utils.arrayForEach(childSubscriptions, function (sub) {
            if (sub && sub.dispose) sub.dispose();
        });
        originalDispose.apply(this, arguments);
    }
    return subscription;
}

/* ==========================================================================
   Base Entities
   ========================================================================== */

function layer(id) {
	var self = this;
	self.id = id;
	self.keyframes = ko.observableArray([]);

	self.addKeyframe = function(time) {
		self.keyframes.push(new keyframe(time));
	};

	self.removeKeyframe = function(keyframe) {
		self.keyframes.remove(keyframe);
	};

	self.updateKeyframeAnimation = function() {
		//console.log('Preparing layer update');

		var keyframes = _.sortBy(self.keyframes(), function(elem) { return elem.percentage(); });
		var css = "";
		var stylesheet = document.styleSheets[document.styleSheets.length - 1];

		// Delete existing keyframe animation
		for (var i=0; i<stylesheet.cssRules.length; i++) {
			if (stylesheet.cssRules[i].name == "layer" + self.id) {
				stylesheet.deleteRule(i);
			}
		}

		// Create new keyframe animation
		for (var i=0; i<keyframes.length; i++) {
			css += " " + (keyframes[i].percentage() * 100) + "% { ";

			for (var n=0; n<keyframes[i].attributes().length; n++) {
				css += keyframes[i].attributes()[n].property() + ": " + keyframes[i].attributes()[n].value() + "; ";
			}

			css += "} ";
		}

		stylesheet.insertRule("@-webkit-keyframes layer" + self.id + " {" + css + "}", stylesheet.cssRules.length);
		//console.log("@-webkit-keyframes layer" + self.id + " {" + css + "}");
	};
}

function keyframe(percentage) {
	var self = this;
	self.percentage = ko.observable(percentage); // range [0,1]
	self.attributes = ko.observableArray([]);

	self.addAttribute = function(property, value) {
		self.attributes.push(new attribute(property, value));
	};

	self.removeAttribute = function(attribute) {
		self.attributes.remove(attribute);
	}
}

function attribute(property, value) {
	var self = this;
	self.property = ko.observable(property);
	self.value = ko.observable(value);
}

/* ==========================================================================
   Main View Model
   ========================================================================== */

function AnimationViewModel() {
	var self = this;

	// TODO: Make this number not hardcoded
	self.length = ko.observable(5000); // milliseconds
	self.playheadPosition = ko.observable(0);
	self.playheadTime = ko.computed(function() {
		return 0; // milliseconds
	}, this);
	self.layers = ko.observableArray([]);
	self.numLayers = '0';

	self.addLayer = function() {
		self.layers.push(new layer(self.numLayers));

		// Apply animation to element
		var element = $('#layer' + self.numLayers);
		if (typeof element != 'undefined') {
			element.css('-webkit-animation', 'layer' + self.numLayers + ' ' + self.length() + 'ms');
			element.css('-webkit-animation-play-state', 'paused');
		}

		self.numLayers++;
	};

	self.removeLayer = function(layer) {
		$('#layer' + layer.id).remove();
		self.layers.remove(layer);
	};

	self.updateKeyframeAnimations = function() {
		var layers = self.layers();
		for (var i=0; i<layers.length; i++) {
	    	layers[i].updateKeyframeAnimation();
	    }
	};

	// Subscribe to changes on layers, keyframes, attributes
	self.layers.select(function(layer) {
	    //console.log('Layer updated');
	    self.updateKeyframeAnimations();
	    
	    return layer.keyframes.select(function (keyframe) {
	    	//console.log('Keyframe updated');
	    	self.updateKeyframeAnimations();
	        
	        return keyframe.attributes.select(function (attribute) {
	            //console.log('Attribute updated');
	            self.updateKeyframeAnimations();
	        });
	    });
	});

	// Plays the animation starting at the playhead
	self.playAnimation = function() {
		$('.animationElement').css('-webkit-animation-play-state', 'paused');
		$('.animationElement').css('-webkit-animation-delay', '-' + self.playheadTime() + 'ms');
		setTimeout("$('.animationElement').css('-webkit-animation-play-state', 'running')", 0);
	};

	// Updates the stage based on the playhead position
	self.seekAnimation = function() {
		$('.animationElement').css('-webkit-animation-delay', '-' + self.playheadTime() + 'ms');
		$('.animationElement').css('-webkit-animation-play-state', 'running');
		setTimeout("$('.animationElement').css('-webkit-animation-play-state', 'paused')", 0)
	}
}

function testAnimation() {
	mainVM.addLayer();
	mainVM.layers()[0].addKeyframe(0);
	mainVM.layers()[0].keyframes()[0].addAttribute('margin-left', '0px');
	mainVM.layers()[0].addKeyframe(1);
	mainVM.layers()[0].keyframes()[1].addAttribute('margin-left', '500px');
}

var mainVM = new AnimationViewModel();
ko.applyBindings(mainVM);

testAnimation();