/* ==========================================================================
   Base Entities
   ========================================================================== */

window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
                              window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;

function layer(id) {
	var self = this;
	self.id = id;
	self.name = ko.observable('Layer ' + (id + 1));
	self.editingName = ko.observable(false);
	self.keyframes = ko.observableArray([]);
	self.sortFunction = ko.observable(function(a, b){
        return a.property() == b.property() ? 0 : (a.property() < b.property() ? -1 : 1);
    });
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

		attrs = attrs.sort(self.sortFunction());
		return attrs;
	}, this);

	self.editName = function() { self.editingName(true); };

	self.addKeyframe = function(percentage) {
		self.keyframes.push(new keyframe(percentage));
	};

	self.removeKeyframe = function(keyframe) {
		self.keyframes.remove(keyframe);

		// Update stage
		mainVM.updateKeyframeAnimations();
		setTimeout(function() { mainVM.seekAnimation(); }, 10);
	};

	self.removeBadAttributes = function() {
		var attrs = self.attributes();
		for (var i=0; i<attrs.length; i++) {
			if ((attrs[i].property() == "") || (attrs[i].value() == "")) {
				attrs[i].parent().removeAttribute(attrs[i]);
			}
		}
	};

	self.removeAttribute = function(attribute) {
		for (var i=0; i<self.keyframes().length; i++) {
			for (var n=0; n<self.keyframes()[i].attributes().length; n++) {
				if (self.keyframes()[i].attributes()[n].property() == attribute.property()) {
					self.keyframes()[i].removeAttribute(self.keyframes()[i].attributes()[n]);
				}
			}
		}
		mainVM.updateKeyframeAnimations();
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
				i -= 1;
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

	self.addAttribute = function(property, value, propertySet) {
		var newAttr = new attribute(property, value);
		newAttr.parent(self);
		if (propertySet == true) {
			newAttr.propertySet(true);
		} else {
			newAttr.editingProperty(true);
		}
		self.attributes.push(newAttr);
	};

	self.removeAttribute = function(attribute) {
		self.attributes.remove(attribute);
	}

	self.toggleAttribute = function(attribute) {
		if (self.active()) {
			self.attributes.remove(attribute);
			mainVM.updateKeyframeAnimations();
		} else {
			attribute.save();
		}
	}
}

function attribute(property, value) {
	var self = this;
	self.parent = ko.observable(null);
	self.property = ko.observable(property);
	self.propertySet = ko.observable(false);
	self.value = ko.observable(value);
	self.currentValue = ko.observable(self.value());
	self.editingProperty = ko.observable(false);
	self.editingValue = ko.observable(false);
	self.editing = ko.computed(function() {
		return (self.editingProperty() || self.editingValue());
	});

	// Keep current value updated when value changes
	self.value.subscribe(function() {
		if ((self.property() != "") && (self.value() != "")) {
			self.updateCurrentValue();
		}
	}, this);

	// Keep current value updated when playhead moves
	mainVM.playheadPosition.subscribe(function() {
		if ((self.property() != "") && (self.value() != "")) {
			self.updateCurrentValue();
		}
	}, this);

	self.editProperty = function() { self.editingProperty(true); };
	self.editValue = function() { self.editingValue(true) };

	self.clearUnsavedChanges = function() {
		setTimeout(function() { self.updateCurrentValue(); }, 100);
	};

	self.save = function() {
		// Data valid?		
		if ((self.property() == '') || (self.currentValue() == '')) {
			return;
		}

		self.propertySet(true);

		// New keyframe needed?
		if (!self.parent().active()) {
			// Find active keyframe
			var activeFound = false;
			for (var i=0; i<mainVM.selectedLayer().keyframes().length; i++) {
				if (mainVM.selectedLayer().keyframes()[i].active()) {
					mainVM.selectedLayer().keyframes()[i].addAttribute(self.property(), self.currentValue(), true);
					activeFound = true;
					break;
				}
			}

			if (!activeFound) {
 				mainVM.selectedLayer().addKeyframe(mainVM.playheadPosition());
				var numKeyframes = mainVM.selectedLayer().keyframes().length;
				mainVM.selectedLayer().keyframes()[numKeyframes-1].addAttribute(self.property(), self.currentValue(), true);
			}
		} else {
			self.value(self.currentValue());
		}

		// Disable editing
		self.editingProperty(false);
		self.editingValue(false);

		// Update stage
		mainVM.updateKeyframeAnimations();
		setTimeout(function() { mainVM.seekAnimation(); }, 30);
		setTimeout(function() { self.updateCurrentValue(); }, 30);
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

        return true;
	};

	self.valKeypress = function(data, e) {
        return true;
 	};

}

/* ==========================================================================
   Main View Model
   ========================================================================== */

function AnimationViewModel() {
	var self = this;
	self.length = ko.observable(5000); // milliseconds
	self.editingLength = ko.observable(false);
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
	self.modalVisible = ko.observable(false);
	self.introVisible = ko.observable(true);
	self.numLayers = 0;

	self.editLength = function() {
		self.editingLength(true);
	};

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
		setTimeout(function() { self.seekAnimation(); }, 30);
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
		if (!$.isArray(self.selectedLayer())) {
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
	self.layers.watch({ recurse: true }, function (params, trigger) {
		self.updateKeyframeAnimations();
	});

	// Plays the animation starting at the playhead
	self.playAnimation = function() {
		// Temporary fix for playback errors
		self.stopAnimation();

		// Remove attributes with invalid data
		var layers = self.layers();
		for (var i=0; i<layers.length; i++) {
			layers[i].removeBadAttributes();
	    }

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

	self.generateCSS = function() {
		self.modalVisible(true);

		var stylesheet = document.styleSheets[document.styleSheets.length - 1];
		var css = "div { width: 100px; height: 100px; }";

		// Delete existing keyframe animation
		for (var i=0; i<stylesheet.cssRules.length; i++) {
			if (stylesheet.cssRules[i].name !== undefined) {
				if (stylesheet.cssRules[i].name.indexOf('layer') != -1) {
					css += stylesheet.cssRules[i].cssText;
				}
			} else {
				if (stylesheet.cssRules[i].cssText.indexOf('#layer') != -1) {
					css += stylesheet.cssRules[i].cssText;
				}
			}
		}

		// Add animation init
		for (var i=0; i<self.layers().length; i++) {
			css += '#layer' + self.layers()[i].id + ' { ';
			css += '-webkit-animation: layer' + self.layers()[i].id + ' ' + self.length() + 'ms linear running; }';
		}

		// Add layer names
		for (var i=0; i<self.layers().length; i++) {
			css = self.replaceAll('layer' + self.layers()[i].id, self.camelize(self.layers()[i].name()), css);
		}

		// Clean up CSS
		css = self.replaceAll('@', '<br><br>@', css);
		css = self.replaceAll('#', '<br><br>#', css);
		css = self.replaceAll('{', '{<br>', css);
		css = self.replaceAll(';', ';<br>', css);

		$('#code').html(css);
	}

	self.camelize = function(str) {
		return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function(letter, index) {
			return index == 0 ? letter.toLowerCase() : letter.toUpperCase();
		}).replace(/\s+/g, '');
	}

	self.escapeRegExp = function(str) {
		return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
	}

	self.replaceAll = function(find, replace, str) {
		return str.replace(new RegExp(self.escapeRegExp(find), 'g'), replace);
	}

	self.hideModal = function() { self.modalVisible(false) };

	self.hideIntro = function() { 
		// Add an intial layer
		self.addLayer();

		self.introVisible(false);
	};

	self.showExample = function() {
		self.introVisible(false);

		// Make sample animation
		self.addLayer();
		self.layers()[0].addKeyframe(0);
		self.layers()[0].keyframes()[0].addAttribute('margin-left', '0px');
		self.layers()[0].keyframes()[0].addAttribute('margin-top', '0px');
		self.layers()[0].keyframes()[0].addAttribute('background', 'blue');
		self.layers()[0].keyframes()[0].addAttribute('border-radius', '100px');
		self.layers()[0].addKeyframe(1);
		self.layers()[0].keyframes()[1].addAttribute('margin-left', '500px');
		self.layers()[0].keyframes()[1].addAttribute('margin-top', '200px');
		self.layers()[0].keyframes()[1].addAttribute('background', 'red');

		for (var i=0; i<self.layers()[0].keyframes()[0].attributes().length; i++) {
			self.layers()[0].keyframes()[0].attributes()[i].save();
		}
	};

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

	// Automatically resize with of attribute inputs
	function resizeInput() {
    	$(this).attr('size', $(this).val().length);
	}
	$(document).on('keyup', '.attributeWrap input', resizeInput);

	// Automatically save attribute changes
	function clearUnsavedChanges() {
		var attrs = self.selectedLayer().attributes();

		for (var i=0; i<attrs.length; i++) {
			attrs[i].clearUnsavedChanges();
		}
	}
	$(document).on('blur', '.attributeWrap input', clearUnsavedChanges);

	function handleClick(e) {
		// Prevent invalid attributes
		if ((e.target.localName != 'span') && (e.target.className != 'attributeWrap')) {
			var layers = self.layers();
			for (var i=0; i<layers.length; i++) {
				layers[i].removeBadAttributes();
		    }
		}

		// Deselect selected elements
		if (e.target.className != 'keyframe selected') {
			if (self.selectedKeyframe() != null) {
				self.selectedKeyframe().selected(false);
				self.selectedKeyframe(null);
			}
		}
	}
	$(document).on('click', handleClick);

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

var mainVM = new AnimationViewModel();
ko.applyBindings(mainVM);

$(document).ready(function() {
  	var BrowserDetect = 
	{
	    init: function () 
	    {
	        this.browser = this.searchString(this.dataBrowser) || "Other";
	        this.version = this.searchVersion(navigator.userAgent) ||       this.searchVersion(navigator.appVersion) || "Unknown";
	    },

	    searchString: function (data) 
	    {
	        for (var i=0 ; i < data.length ; i++)   
	        {
	            var dataString = data[i].string;
	            this.versionSearchString = data[i].subString;

	            if (dataString.indexOf(data[i].subString) != -1)
	            {
	                return data[i].identity;
	            }
	        }
	    },

	    searchVersion: function (dataString) 
	    {
	        var index = dataString.indexOf(this.versionSearchString);
	        if (index == -1) return;
	        return parseFloat(dataString.substring(index+this.versionSearchString.length+1));
	    },

	    dataBrowser: 
	    [
	        { string: navigator.userAgent, subString: "Chrome",  identity: "Chrome" },
	        { string: navigator.userAgent, subString: "MSIE",    identity: "Explorer" },
	        { string: navigator.userAgent, subString: "Firefox", identity: "Firefox" },
	        { string: navigator.userAgent, subString: "Safari",  identity: "Safari" },
	        { string: navigator.userAgent, subString: "Opera",   identity: "Opera" }
	    ]

	};
	BrowserDetect.init();

	if (BrowserDetect.browser != 'Chrome') {
		$('.wrapper').hide();
		$('#timelineWrapper').hide();
		$('.intro .buttonWrap').hide();
		$('#browserWarning').show();
	}
});

window.onbeforeunload = function() {
  if (mainVM.layers().length > 0) {
  	return 'Are you sure you want to leave? Your animation will not be saved.';
  }
};