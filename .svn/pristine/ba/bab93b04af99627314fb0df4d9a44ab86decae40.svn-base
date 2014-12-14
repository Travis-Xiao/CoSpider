module.exports = IssueDAO;
var db = require('./db.js');
var crypto = require('crypto');
var Lock = require('./lock.js');
var lock = new Lock();

var that = this;

var hashValue = "nishishabi_";

function IssueDAO(){
	if(!(this instanceof IssueDAO)){
		return new IssueDAO();
	}
	this.innerError = false;
}

IssueDAO.prototype.timeCompare = function(time1, time2){
	var obj1 = time1.split(',');
	var obj2 = time2.split(',');

	if(obj1.toString() == obj2.toString())
		return false;

	for(var i = 0; i < obj1.length; i++){
		if(parseInt(obj1[i]) > parseInt(obj2[i]))
			return false;
	}

	return true;	
}

IssueDAO.prototype.createIssue = function (projectId, members, description, startTime, endTime, type, callback){
	if (!issueDAO.timeCompare(startTime, endTime))
		return callback('error time');
	
	db.user.find({
		name: {
			$in : members
	}}, function (err, users){
		if (err)
			return callback('inner error');
		if (!users)
			return callback('inner error');
		
		var userIds = [];
		for (i in users)
			userIds.push(users._id);
		db.issue.insert({
			projectId:projectId,
			members:userIds,
			description:description,
			file:null,
			startTime:startTime,
			endTime:endTime,
			isComplete:false,
			type:type,
		}, function (err, newIssue){
			if(err)
				return callback('inner error');
			if(!newIssue)
				return callback('inner error');
				
			return callback(null);
		});
	});
};

IssueDAO.prototype.setComplete = function (issueId, callback){
	lock.acquire(hashValue + issueId.toString(), function (){
		db.issue.findOne({
			_id:issueId
		}, function (err, issue){
			if (err){
				lock.release(hashValue + issueId.toString());
				return callback('inner error');
			}
			if (!issue){
				lock.release(hashValue + issueId.toString());
				return callback('invalid issue');
			}
			
			db.issue.update({
				_id:issueId
			}, {
				$set:{
					isComplete:!issue.isComplete
			}}, function (err, reply){
				lock.release(hashValue + issueId.toString());
				if (err)
					return callback('inner error');
				if (!reply)
					return callback('inner error');
				callback(null);
			});
		});
	});
};

IssueDAO.prototype.changeIssue = function (issueId, members, description, startTime, endTime, callback){
	if (!timeCompare(startTime, endTime))
		return callback('error time');
	
	lock.acquire(hashValue + issueId.toString(), function (){
		db.issue.findOne({
			_id:issueId
		}, function (err, issue){
			if (err){
				lock.release(hashValue + issueId.toString());
				return callback('inner error');
			}
			if (!issue){
				lock.release(hashValue + issueId.toString());
				return callback('invalid issue');
			}
			if (issue.isComplete){
				lock.release(hashValue + issueId.toString());
				return callback('issue complete');
			}
			
			db.issue.update({
				_id:issueId
			}, {
				$set: {
					members: members,
					description: description,
					startTime: startTime,
					endTime: endTime
			}}, function (err, reply){
				lock.release(hashValue + issueId.toString());
				if (err)
					return callback('inner error');
				if (!reply)
					return callback('inner error');
				callback(null);
			});
		});
	});
};

IssueDAO.prototype.deleteIssue = function(issueId, callback){
	lock.acquire(hashValue + issueId.toString(), function (){
		db.issue.remove({
			_id:issue
		}, function (err, reply){
			lock.release(hashValue + issueId.toString());
			if (err)
				return callback('inner error');
			if (!reply)
				return callback('inner error');
			callback(null);
		});
	});
};

IssueDAO.prototype.getIssues = function (projectId, callback){
	that = this;
	db.issue.find({
		projectId: projectId
	}, function (err, issues){
		if (err)
			return callback('inner error');
		
		that.setIssueMembers(issues.length - 1, issues, function (err, issues){
			if (err)
				return callback('inner error');
			
			callback(null, issues);
		});
	});
};

IssueDAO.prototype.setIssueMembers = function (i, issues, callback){
	if (i < 0)
		return callback(null, issues);
	
	db.user.find({
		_id : {
			$in : issues[i].members
	}}, function (err, users){
		if (err)
			return callback('inner error');
		if (!users)
			return callback('inner error');
		
		issues[i].members = users;
		that.setIssueMembers(i - 1, issues, callback);
	});
};