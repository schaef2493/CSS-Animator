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
                        if (move) move(editItem.value, editItem.index, editItem.moved);
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

window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
                              window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;

function layer(id) {
	var self = this;
	self.id = id;
	self.keyframes = ko.observableArray([]);
	self.attributes = ko.computed(function() {
		var activeAttrs = [];
		var attrs = [];

		for (var i=0; i<self.keyframes().length; i++) {
			// Identify active keyframe, if it exists
			if (self.keyframes()[i].active()) {
				activeAttrs = self.keyframes()[i].attributes();
			}

			// Collect all attributes
			attrs = attrs.concat(self.keyframes()[i].attributes());
		}

		// Keep the active attrs
		if (activeAttrs != []) {	
			for (var i=0; i<activeAttrs.length; i++) {
				attrs = _.reject(attrs, function(el) { 
					return (el.property() == activeAttrs[i].property()) && (el != activeAttrs[i]);
				});
			}
		}

		// Remove other duplicates
		attrs = _.uniq(attrs, function(item, key, attrs) {
		    return item.property();
		})

		return attrs;
	}, this);

	self.addKeyframe = function(percentage) {
		self.keyframes.push(new keyframe(percentage));
	};

	self.removeKeyframe = function(keyframe) {
		self.keyframes.remove(keyframe);
	};

	self.addAttribute = function() {
		for (var i=0; i<self.keyframes().length; i++) {
			if (self.keyframes()[i].active()) {
				self.keyframes()[i].addAttribute('', '');
				return;
			}
		}

		self.addKeyframe(mainVM.playheadPosition());
		self.keyframes()[self.keyframes().length-1].addAttribute('', '');
	};

	self.updateKeyframeAnimation = function() {
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
	};
}

function keyframe(percentage) {
	var self = this;
	self.percentage = ko.observable(percentage); // range [0,1]
	self.attributes = ko.observableArray([]);
	self.active = ko.computed(function() {
		return Math.abs(mainVM.playheadPosition() - self.percentage()) < .005;
	}, this);

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
	self.currentValue = ko.observable(self.value());
	
	// Keep current value updated when value changes
	self.value.subscribe(function() {
		self.updateCurrentValue();
	}, this);

	// Keep current value updated when playhead moves
	mainVM.playheadPosition.subscribe(function() {
		self.updateCurrentValue();
	}, this);

	// TODO: Need a button to begin a new keyframe/attribute next to each attr
	// Need a way to detect changes to currentValue due to user input
	// Need a way to display value, not currentValue, when on active keyframe

	self.updateCurrentValue = function() {
		// Get current value
		var layerID = mainVM.selectedLayer().id;
		var newValue = $('#layer' + layerID).css(self.property());

		// Round long numbers for display
		if (newValue.indexOf('px') != -1) {
			newValue = newValue.replace('px', '');
			newValue = Math.round(newValue) + 'px';
		}

		self.currentValue(newValue);
	}
}

/* ==========================================================================
   Main View Model
   ========================================================================== */

function AnimationViewModel() {
	var self = this;

	// TODO: Make this number not hardcoded
	self.length = ko.observable(5000); // milliseconds
	self.playheadPosition = ko.observable(0); // [0..1]
	self.playheadTime = ko.computed(function() {
		return self.playheadPosition() * self.length(); // milliseconds
	}, this);
	self.playheadAnimationStart = null;
	self.timeLeftInAnimation = 0;
	self.layers = ko.observableArray([]);
	self.selectedLayer = ko.observableArray([]);
	self.numLayers = 0;

	self.addLayer = function() {
		self.layers.push(new layer(self.numLayers));

		// Apply animation to element
		self.resetAnimation();

		// Set selected layer to new layer
		self.selectedLayer(self.layers()[self.numLayers]);
		self.numLayers++;
	};

	self.removeLayer = function(layer) {
		$('#layer' + layer.id).remove();
		self.layers.remove(layer);
	};

	self.setSelectedLayer = function(layer) {
		self.selectedLayer(layer);
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
		setTimeout(function() { 
			$('.animationElement').css('-webkit-animation-play-state', 'running');
			self.timeLeftInAnimation = self.length() - self.playheadTime();
			
			// Animate movement of playhead
			requestAnimationFrame(self.animatePlayhead);
		}, 0);
	};

	// Animates the playhead alongside the main animation
	self.animatePlayhead = function(timestamp) {
		if (self.playheadAnimationStart == null) {
			self.playheadAnimationStart = timestamp;
			var delta = 0;
		} else {
			var delta = timestamp - self.playheadAnimationStart;
			self.playheadAnimationStart = timestamp;
		}

		self.playheadPosition(1 - (self.timeLeftInAnimation / self.length()));

		// Update time left in animation
		self.timeLeftInAnimation -= delta;
		if (self.timeLeftInAnimation < 0) {
			self.timeLeftInAnimation = 0;
			self.playheadPosition(0);
			self.playheadAnimationStart = null;
			self.stopAnimation();
		} else {
			requestAnimationFrame(self.animatePlayhead);
		}
	};

	// Resets animation
	self.resetAnimation = function() {
		$('.animationElement').css('-webkit-animation', '');
		setTimeout(function() {
			for (var i=0; i<=mainVM.numLayers; i++) {
				$('#layer'+ i).css('-webkit-animation', 'layer' + i + ' ' + self.length() + 'ms linear running');
				$('#layer'+ i).css('-webkit-animation-play-state', 'paused');
			}
		}, 0);
	}

	// Stops the animation & moves playhead to start
	self.stopAnimation = function() {
		self.resetAnimation();
		self.playheadPosition(0);
		self.timeLeftInAnimation = 0;
		self.playheadAnimationStart = null;
	}

	// Allow spacebar to control playback
	window.onkeydown = function(e) { 
		// Space bar pressed
		if (e.keyCode == 32) {
			e.preventDefault();

			if (self.timeLeftInAnimation == 0) {
				self.playAnimation();
			} else {
				self.stopAnimation();
			}
			return false;
		}
	};

	// Alow enter to create a new attribute
	$('.attributeWrap input').bind('keypress', function(e) {
		// Enter key pressed
		if (e.keyCode == 32) {
			self.selectedLayer().addAttribute('');
		}
	});

	// Updates the stage based on the playhead position
	self.seekAnimationPostThrottle = function() {
		$('.animationElement').addClass('invisible');
		self.resetAnimation();
		setTimeout(function() {
			$('.animationElement').css('-webkit-animation-delay', '-' + self.playheadTime() + 'ms');
			$('.animationElement').css('-webkit-animation-play-state', 'running');
			setTimeout("$('.animationElement').css('-webkit-animation-play-state', 'paused')", 0);
			$('.animationElement').removeClass('invisible');
		}, 5);
	}

	// Throttles number of seeks for performance
	self.seekAnimation = _.throttle(self.seekAnimationPostThrottle, 250);

	// Bind to playhead drags
	$('#playhead').draggable({
		handle: "#playheadHandle",
		snap: "#timelineWrapper", 
		snapMode: "inner",
		containment: "#playheadWrapper",
		scroll: false,
		axis: "x",
		drag: function(e) {
			// Update playhead location
			var newLeft = parseInt($(e.target).css('left'));
			var maxWidth = parseInt($('#playheadWrapper').width());
			var percentage = newLeft / maxWidth;

			// Fix for right snap edge case
			if (newLeft == maxWidth - 1) {
				percentage = 1;
			}

			self.playheadPosition(percentage);

			if (newLeft > ($(document).width()-340)) {
				e.preventDefault();
			}

			self.seekAnimation();
		},
		stop: function(e) {
			var temp = self.playheadPosition();
			self.playheadPosition(0);
			self.playheadPosition(temp);
		}
	});

}

function testAnimation() {
	mainVM.addLayer();
	mainVM.layers()[0].addKeyframe(0);
	mainVM.layers()[0].keyframes()[0].addAttribute('margin-left', '0px');
	mainVM.layers()[0].addKeyframe(1);
	mainVM.layers()[0].keyframes()[1].addAttribute('margin-left', '710px');
}

var mainVM = new AnimationViewModel();
ko.applyBindings(mainVM);

testAnimation();