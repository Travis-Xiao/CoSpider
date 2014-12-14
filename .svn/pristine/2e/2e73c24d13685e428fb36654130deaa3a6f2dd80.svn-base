module.exports = ProjectRecordDAO;
var db = require('./db.js');
var Lock = require('./lock.js');
var UserDAO = require('./userDAO');
var DocDAO = require('./docDAO');

var lock = new Lock();
var userDAO = new UserDAO();
var docDAO = new DocDAO();

function ProjectRecordDAO(){
	if(!(this instanceof ProjectRecordDAO)){
		return new ProjectRecordDAO();
	}
	this.innerError = false;
}
