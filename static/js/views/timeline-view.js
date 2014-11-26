/*登录视图*/
var app = app || {};
(function () {
	'use strict';
	app.TimelineView = Backbone.View.extend({
		el: '#timeline',
		events: {
//			'click #login-submit': 'login'
			'click #timeline-button': 'myClean',
		},
		myClean: function() {
			//console.log("clean");
			$('#my-timeline').empty();
		},
		show: function() {
//			this.el.show();
			$(this.el).modal('show');
			$(this.el).show();
		}
	});
	app.init || (app.init = {});
	app.init.timelineView = function () {
		app.views['timeline'] || (app.views['timeline'] = new app.TimelineView());
	};
})();
