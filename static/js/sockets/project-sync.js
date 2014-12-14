/**
 * Created by Neo on 2014-12-12.
 */
var app = app || {};

(function() {
    var syncProject = function(method, model, options) {
        if (!(app.Lock.attach(options))) {
            return false;
        }
        if (options.virtual && options.virtual === true) {
            return;
        }
        var m, d = { name: model.get('name'),
                     introduction: model.get('introduction')};
        //消息处理
        switch(method) {
            case 'create':
                m = 'createProject';
                break;
//            case 'patch':
//            case 'update':
//                m = 'move';
//                d = { path: options.oldPath, newPath: model.get('path'), };
//                break;
//            case 'create':
//                m = 'new';
//                d.type = model.get('type');
//                break;
//            case 'delete':
//                m = 'delete';
//                break;
        }
        app.socket.emit(m, d);
    };

    var syncProjects = function(method, model, options){
        if (!(app.Lock.attach(options))) {
            return false;
        }
        app.socket.emit("createProject", model);
    }

    app.init || (app.init = {});
    app.init.projectSync = function() {
        app.Project.prototype.sync = syncProject;
        app.Projects.prototype.sync = syncProjects;
    }

    app.init_suf || (app.init_suf = {});
    (function() {
        var _init = false;
        app.init_suf.projectSync = function() {
            if(_init) {
                return;
            }
            _init = true;
            app.init_suf.mainSocket();
            /* 初始化文件相关事件同步收发 */
            var detach = app.Lock.detach;
            app.socket.on('createProject', detach);
//            app.socket.on('add', detach);
//            app.socket.on('move', detach);
        };
    })();

})();
