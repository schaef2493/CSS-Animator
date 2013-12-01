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

		console.log([activeAttrs, attrs]);

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

		// Update stage
		mainVM.updateKeyframeAnimations();
		setTimeout(function() { mainVM.seekAnimation(); }, 10);
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
		var animations = "";
		var singles = "";
		var lastVals = {};
		var firstVals = {};
		var stylesheet = document.styleSheets[document.styleSheets.length - 1];

		// Delete existing keyframe animation
		for (var i=0; i<stylesheet.cssRules.length; i++) {
			if ((stylesheet.cssRules[i].name == "layer" + self.id) || (stylesheet.cssRules[i].selectorText == "#layer" + self.id)) {
				stylesheet.deleteRule(i);
			}
		}


		// Create new keyframe animation
		for (var i=0; i<keyframes.length; i++) {
			if ((keyframes[i].percentage() != 0) && (keyframes[i].percentage() != 1)) {
				animations += " " + (keyframes[i].percentage() * 100) + "% { ";

				for (var n=0; n<keyframes[i].attributes().length; n++) {
					if (!self.attributeIsSingle(keyframes[i].attributes()[n])) {
						animations += keyframes[i].attributes()[n].property() + ": " + keyframes[i].attributes()[n].value() + "; ";
						
						lastVals[keyframes[i].attributes()[n].property()] = keyframes[i].attributes()[n].value();
						
						if (!firstVals.hasOwnProperty(keyframes[i].attributes()[n].property())) {
							firstVals[keyframes[i].attributes()[n].property()] = keyframes[i].attributes()[n].value();
						}
					} else {
						singles += keyframes[i].attributes()[n].property() + ": " + keyframes[i].attributes()[n].value() + "; ";
					}
				}

				animations += "} ";
			} else {
				for (var n=0; n<keyframes[i].attributes().length; n++) {
					if (!self.attributeIsSingle(keyframes[i].attributes()[n])) {
						
						if (keyframes[i].percentage() == 0) {
							firstVals[keyframes[i].attributes()[n].property()] = keyframes[i].attributes()[n].value();
						} else {
							lastVals[keyframes[i].attributes()[n].property()] = keyframes[i].attributes()[n].value();
						}

					} else {
						singles += keyframes[i].attributes()[n].property() + ": " + keyframes[i].attributes()[n].value() + "; ";
					}
				}
			}
		}

		// Append first vals in 0% keyframe
		var firstValsCSS = "";
		firstValsCSS += " 0% { ";
		for (var property in firstVals) {
		    if (firstVals.hasOwnProperty(property)) {
		        firstValsCSS += property + ": " + firstVals[property] + "; ";
		    }
		}
		firstValsCSS += "} ";
		animations = firstValsCSS + animations;

		// Append last vals in 100% keyframe
		animations += " 100% { ";
		for (var property in lastVals) {
		    if (lastVals.hasOwnProperty(property)) {
		        animations += property + ": " + lastVals[property] + "; ";
		    }
		}
		animations += "} ";

		stylesheet.insertRule("@-webkit-keyframes layer" + self.id + " {" + animations + "}", stylesheet.cssRules.length);
		
		if (singles != "") {
			stylesheet.insertRule("#layer" + self.id + " {" + singles + "}", stylesheet.cssRules.length);
		}
	};

	self.attributeIsSingle = function(attribute) {
		var attr = attribute.property();
		var keyframes = self.keyframes();
		var count = 0;

		for (var i=0; i<keyframes.length; i++) {
			for (var n=0; n<keyframes[i].attributes().length; n++) {
				if (keyframes[i].attributes()[n].property() == attr) {
					count++;
				}
			}
		}

		if (count == 1) {
			return true;
		} else {
			return false;
		}
	};
}

function keyframe(percentage) {
	var self = this;
	self.percentage = ko.observable(percentage); // range [0,1]
	self.attributes = ko.observableArray([]);
	self.active = ko.computed(function() {
		return Math.abs(mainVM.playheadPosition() - self.percentage()) < .005;
	}, this);
	self.selected = ko.observable(false);

	self.addAttribute = function(property, value) {
		var newAttr = new attribute(property, value);
		newAttr.parent(self);
		newAttr.editingProperty(true);
		self.attributes.push(newAttr);
	};

	self.toggleAttribute = function(attribute) {
		if (self.active()) {
			self.attributes.remove(attribute);
		} else {
			attribute.save();
		}
	}
}

function attribute(property, value) {
	var self = this;
	self.parent = ko.observable(null);
	self.property = ko.observable(property);
	self.value = ko.observable(value);
	self.currentValue = ko.observable(self.value());
	self.editingProperty = ko.observable(false);
	self.editingValue = ko.observable(false);
	self.editing = ko.computed(function() {
		return (self.editingProperty() || self.editingValue());
	});

	// Keep current value updated when value changes
	self.value.subscribe(function() {
		self.updateCurrentValue();
	}, this);

	// Keep current value updated when playhead moves
	mainVM.playheadPosition.subscribe(function() {
		self.updateCurrentValue();
	}, this);

	self.editProperty = function() { this.editingProperty(true) };
	
	self.editValue = function() { this.editingValue(true) };

	self.save = function() {
		// New keyframe needed?
		if (!self.parent().active()) {
			mainVM.selectedLayer().addKeyframe(mainVM.playheadPosition());
			var numKeyframes = mainVM.selectedLayer().keyframes().length;
			mainVM.selectedLayer().keyframes()[numKeyframes-1].addAttribute(self.property(), self.currentValue());
		} else {
			self.value(self.currentValue());
		}

		// Disable editing
		self.editingProperty(false);
		self.editingValue(false);

		// Update stage
		mainVM.updateKeyframeAnimations();
		setTimeout(function() { mainVM.seekAnimation(); }, 10);
		setTimeout(function() { self.updateCurrentValue(); }, 10);
	};

	self.updateCurrentValue = function() {
		if (self.parent().active()) {
			self.currentValue(self.value());
		} else {
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
	};

	self.propKeypress = function(data, e) {
		// Tab key pressed
		if (e.keyCode == 9) {
            self.editingValue(true);
            return false;
        }

        // Enter key pressed
		if (e.keyCode == 13) {
            self.save();
            return false;
        };

        return true;
	};

	self.valKeypress = function(data, e) {
		// Tab key pressed
		if (e.keyCode == 9) {
            self.save();
            return false;
        }

        // Enter key pressed
		if (e.keyCode == 13) {
            self.save();
            return false;
        };

        return true;
	};
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
		if (self.playheadPosition() == 1) {
			return .9999 * self.length(); // milliseconds
		} else {
			return self.playheadPosition() * self.length(); // milliseconds
		}
	}, this);
	self.playheadAnimationStart = null;
	self.timeLeftInAnimation = ko.observable(0);
	self.layers = ko.observableArray([]);
	self.selectedKeyframe = ko.observable(null);
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

		// Update stage
		self.updateKeyframeAnimations();
		setTimeout(function() { self.seekAnimation(); }, 10);
	};

	self.setSelectedLayer = function(layer) {
		self.selectedLayer(layer);
	};

	self.setSelectedKeyframe = function(keyframe) {
		if (self.selectedKeyframe() != null) {
			self.selectedKeyframe().selected(false);
		}

		if (self.selectedKeyframe() == keyframe) {
			keyframe.selected(false);
			self.selectedKeyframe(null);
		} else {
			keyframe.selected(true);
			self.selectedKeyframe(keyframe);
		}
	}

	self.updateKeyframeAnimations = function() {
		// Remove empty keyframes
		if (self.selectedLayer().length > 1) {
			for (var i=0; i<self.selectedLayer().keyframes().length; i++) {
				if (self.selectedLayer().keyframes()[i].attributes().length == 0) {
					self.selectedLayer().removeKeyframe(self.selectedLayer().keyframes()[i])
				}
			}
		}

		var layers = self.layers();
		for (var i=0; i<layers.length; i++) {
	    	layers[i].updateKeyframeAnimation();
	    }
	};

	// Subscribe to changes on layers, keyframes, attributes
	self.layers.select(function(layer) {
	    self.updateKeyframeAnimations();
	    
	    return layer.keyframes.select(function (keyframe) {
	    	self.updateKeyframeAnimations();
	        
	        return keyframe.attributes.select(function (attribute) {
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
			self.timeLeftInAnimation(self.length() - self.playheadTime());
			
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

		self.playheadPosition(1 - (self.timeLeftInAnimation() / self.length()));

		// Update time left in animation
		self.timeLeftInAnimation(self.timeLeftInAnimation() - delta);
		if (self.timeLeftInAnimation() < 0) {
			self.timeLeftInAnimation(0);
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
		self.timeLeftInAnimation(0);
		self.playheadAnimationStart = null;
	}

	// Allow keypresses to control app
	window.onkeydown = function(e) { 
		// Space bar pressed
		if (e.keyCode == 32) {
			// Don't continue if attribute editor is active
			if (document.activeElement.type == "text") {
				return;
			}
			
			e.preventDefault();

			if (self.timeLeftInAnimation() == 0) {
				self.playAnimation();
			} else {
				self.stopAnimation();
			}

			return false;
		}

		// Backspace/delete pressed
		if ((e.keyCode == 8) || (e.keyCode == 46)) {
			// Don't continue if attribute editor is active
			if (document.activeElement.type == "text") {
				return;
			}

			// Delete selectedKeyframe
			if (self.selectedKeyframe() != null) {
				self.selectedLayer().removeKeyframe(self.selectedKeyframe());
				self.selectedKeyframe(null);
			}

			return false;
		}
	};

	// Alow enter to create a new attribute
	// $('.attributeWrap input').bind('keypress', function(e) {
	// 	// Enter key pressed
	// 	if (e.keyCode == 32) {
	// 		self.selectedLayer().addAttribute('');
	// 	}
	// });

	// Automatically resize with of attribute inputs
	function resizeInput() {
    	$(this).attr('size', $(this).val().length);
	}
	$(document).on('keyup', '.attributeWrap input', resizeInput);

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