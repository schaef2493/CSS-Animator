==========================================================================
CSS Animation Generator
==========================================================================

Overview

This tool allows you to design, prototype, and create incredibly complex 
CSS keyframe animations through the use of a visual timeline editor.
It enables those with knowledge of CSS to design rich animations for
immediate use in production. This project was created by Kevin Schaefer 
(http://kjschaef.com) as his final project for Software Structures for 
User Interfaces Lab (05-433).

How to run

Due to Chrome security policies, this code has to be served from a webserver 
to be executed without error. Anvil (http://anvilformac.com) makes this easy. 

After serving the app from a web server, open the app in Chrome. Animations
can be created through use of the three primary UI panes: the attribute
inspector (top left), the stage (top right), and the timeline (bottom).

The inspector displays all CSS attributes that are being manipulated on the
selected layer. They can be created, modified, and deleted through use of the
inspector. Changes made through the inspector are reflected both on the stage
and in the timeline.

The timeline displays a visual depiction of the animation keyframes across
layers. The active layer can be changed by selecting a different layer from
the timeline. New layers can also be created here. Keyframes can be deleted 
by selecting them and clicking the delete key. Animation playback is 
controlled by the play/stop button. Animation duration is controlled by
editing the field on the top right corner of the timeline.

The stage allows for viewing of the animation. At any time, it reflects 
the state of the animation at the location of the playhead in the timeline.

The generated CSS keyframe animations can be viewed by clicking the button
in the header.

Resources used

Knockout.js (http://knockoutjs.com)
KO Reactor (https://github.com/ZiadJ/knockoutjs-reactor)
Underscore.js (http://underscorejs.org)
JQuery (http://jquery.com)
