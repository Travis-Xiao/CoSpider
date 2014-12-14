var app = app || {};

(function () {
    'use strict';

    app.Projects = Backbone.Collection.extend({
        // Reference to this collection's model.
        model: app.Project
    });

    app.init || (app.init = {});

    app.init.projects = function() {
        app.collections['projects'] || (app.collections['projects'] = new app.Projects());
    };

})();
