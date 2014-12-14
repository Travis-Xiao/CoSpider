module.exports = ProjectDAO;
var db = require('./db.js');
var Lock = require('./lock.js');
var UserDAO = require('./userDAO');
var DocDAO = require('./docDAO');
var IssueDAO = require('./issueDAO');

var lock = new Lock();
var userDAO = new UserDAO();
var docDAO = new DocDAO();
var issueDAO = new IssueDAO();

var hashValue = 'woshishabi_';

function ProjectDAO(){
	if(!(this instanceof ProjectDAO)){
		return new ProjectDAO();
	}
	this.innerError = false;
}

//db.project.insert({name:'cospider', ownerId:ObjectId("548722faa321533c1919df16"), members:[], introduction:'test', createTime:1418142458191});

function validateName(str){
	var re = /^[A-Za-z0-9]*$/;
	return str.length >= 6 && str.length <= 20 && re.test(str);
};

ProjectDAO.prototype.createProject = function (name, userId, introduction, callback){
	if (!validateName(name))
		return callback('invalid project name');
	
	lock.acquire(hashValue + name, function(){
		db.user.findOne({
			_id:userId
		}, function (err, user){
			if (err){
				lock.release(hashValue + name);
				return callback('inner error');
			}
			if (!user){
				lock.release(hashValue + name);
				return callback('invalid user id');
			}
			db.project.findOne({
				name:name
			}, function (err, project){
				if (err){
					lock.release(hashValue + name);
					return callback('inner error');
				}
				if (project){
					lock.release(hashValue + name);
					return callback('project exsits');
				}
				db.project.insert({
					name:name, 
					ownerId:userId, 
					members:[], 
					introduction:introduction, 
					createTime:new Date().getTime()
				}, function (err, newProject){
					console.log(newProject);
					if (err){
						lock.release(hashValue + name);
						return callback('inner error');
					}
					if (!newProject){
						lock.release(hashValue + name);
						return callback('inner error');
					}
					db.user.update({
						_id:userId
					}, {
						$push:{
							projects:newProject._id
						}
					}, function (err, reply){
						if (err){
							lock.release(hashValue + name);
							return callback('inner error');
						}
						db.projectRecord.insert({
							projectId:newProject._id, 
							userId:userId, 
							modifyTime:new Date().getTime(), 
							type:'create'
						}, function (err, newProjectRecord){
							if (err){
								lock.release(hashValue + name);
								return callback('inner error');
							}
							else{
								lock.release(hashValue + name);
								return callback(null, newProject.createTime, newProject._id);
							}
						});
					});
				});
			});
		});
	});
};

ProjectDAO.prototype.findProjectByName = function (name, callback){
	db.project.findOne({
		name:name
	}, function (err, project){
		if (err)
			return callback('inner error');
		if (!project)
			return callback('inner error');
			
		var userIds = [];
		userIds.push(project.ownerId);
		for (i in project.members)
			userIds.push(project.members[i]);
		
		db.user.find({
			_id: {
				$in: userIds
		}}, function (err, users){
			if (err)
				return callback('inner error');
			if (!users)
				return callback('inner error');
			
			for (i in users){
				if (users[i]._id == project.ownerId)
					project.owner = users[i];
				else{
					project.members.push(users[i]);
					project.members.splice(0, 1);
				}
			}
			
			docDAO.getDocs(project._id, function (err, docs){
				if (err)
					return callback('inner error');
				if (!docs)
					return callback('inner error');
				
				project.docs = docs;
				issueDAO.getIssues(project._id, function (err, issues){
					if (err)
						return callback('inner error');
					if (!issues)
						return callback('inner error');
					
					project.issues = issues;
					callback(null, project);
				});
			});
		});
	});
};

ProjectDAO.prototype.transferProject = function (projectId, userName, callback){
	lock.acquire(userName, function(){
		db.user.findOne({
			name:userName
		}, function (err, user){
			if (err){
				lock.release(userName);
				return callback('inner error');
			}
			if (!user){
				lock.release(userName);
				return callback('invalid user');
			}
			db.project.findOne({
				_id:projectId
			}, function (err, project){
				if (err){
					lock.release(userName);
					return callback('inner error');
				}
				if (!project){
					lock.release(userName);
					return callback('invalid project');
				}
				if (project.ownerId == user._id){
					lock.release(userName);
					return callback('can not be yourself');
				}
				
				var members = project.members;
				var flag = false;
				
				for (i in members)
					if (members[i] == user._id){
						flag = true;
						members.splice(i ,1);
						break;
					}
				
				if (!flag){
					lock.release(userName);
					return callback('not member');
				}
				
				members.push(project.ownerId)

				db.project.update({
					_id:projectId
				}, {
					$set:{
						ownerId:user._id,
						members:members
				}}, function (err, reply){
					if (err){
						lock.release(userName);
						return callback('inner error');
					}
					if (!reply){
						lock.release(userName);
						return callback('inner error');
					}
					lock.release(userName);
					callback(null);
				});
			});
		});
	});
};

ProjectDAO.prototype.addMember = function (projectId, userName, callback){
	lock.acquire(userName, function (){
		db.user.findOne({name:userName}, function (err, user){
			if (err){
				lock.release(userName);
				return callback('inner error');
			}
			if (!user){
				lock.release(userName);
				return callback('inner error');
			}
			db.project.findOne({_id:projectId}, function (err, project){
				if (err){
					lock.release(userName);
					return callback('inner error');
				}
				if (!user){
					lock.release(userName);
					return callback('inner error');
				}
				if (project.ownerId == user._id){
					lock.release(userName);
					return callback('can not be yourself');
				}
				
				var members = project.members;
				var flag = false;
				
				for (i in members)
					if (members[i] == user._id){
						flag = true;
						break;
					}
				
				if (flag){
					lock.release(userName);
					return callback('already member');
				}
				
				members.push(user._id);
				db.project.update({
					_id:projectId
				}, {
					$set:{
						members:members
				}}, function (err, reply){
					if (err){
						lock.release(userName);
						return callback('inner error');
					}
					if (!reply){
						lock.release(userName);
						return callback('inner error');
					}
					db.user.update({
						_id:user._id
					}, {
						$push:{
							projects:projectId
					}}, function (err, reply1){
						if (err){
							lock.release(userName);
							return callback('inner error');
						}
						if (!reply1){
							lock.release(userName);
							return callback('inner error');
						}
						lock.release(userName);
						callback(null);
					});
				});
			});
		});
	});
};

ProjectDAO.prototype.removeMember = function (projectId, userName, callback){
	lock.acquire(userName, function (){
		db.user.findOne({name:userName}, function (err, user){
			if (err){
				lock.release(userName);
				return callback('inner error');
			}
			if (!user){
				lock.release(userName);
				return callback('inner error');
			}
			db.project.findOne({_id:projectId}, function (err, project){
				if (err){
					lock.release(userName);
					return callback('inner error');
				}
				if (!user){
					lock.release(userName);
					return callback('inner error');
				}
				if (project.ownerId == user._id){
					lock.release(userName);
					return callback('can not remove yourself');
				}
				
				var members = project.members;
				var flag = false;
				
				for (i in members)
					if (members[i] == user._id){
						flag = true;
						members.splice(i ,1);
						break;
					}
				
				if (!flag){
					lock.release(userName);
					return callback('not member');
				}
				
				db.project.update({
					_id:projectId
				}, {
					$set:{
						members:members
				}}, function (err, reply){
					if (err){
						lock.release(userName);
						return callback('inner error');
					}
					if (!reply){
						lock.release(userName);
						return callback('inner error');
					}
					
					var projects = user.projects;
					
					for (i in projects)
						if (projects[i] == projectId){
							projects.members.splice(i, 1);
							break;
						}
					
					db.user.update({
						_id:user._id
					}, {
						$set:{
							projects:projects
					}}, function (err, reply1){
						if (err){
							lock.release(userName);
							return callback('inner error');
						}
						if (!reply1){
							lock.release(userName);
							return callback('inner error');
						}
						lock.release(userName);
						callback(null);
					});
				});
			});
		});
	});
};

ProjectDAO.prototype.changeInfo = function (projectId, name, introduction, callback){
	if (!validateName(name))
		return callback('invalid project name');
	
	db.project.findOne({name:name}, function (err, project){
		if (err)
			return callback('inner error');
		if (project)
			return callback('project exists');
		
		db.project.update({
			_id:projectId
		}, {
			$set:{
				name:name,
				introduction:introduction
		}}, function (err, reply){
			if (err)
				return callback('inner error');
			if (!reply)
				return callback('inner error');
			callback(null);
		});
	});
};