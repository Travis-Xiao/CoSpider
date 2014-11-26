module.exports = DocDAO;
var db = require('./db.js');
var Lock = require('./lock.js');
var UserDAO = require('./userDAO');

var lock = new Lock();
var userDAO = new UserDAO();

function DocDAO(){
	if(!(this instanceof DocDAO)){
		return new DocDAO();
	} 
	this.innerError = false;
	var that = this;
	this._modifyTime = function(path, mTime, callback){
		if(path.split("/").length == 3){
			var paths = path.split("/");
			lock.release("/" + paths[1] + "/" + paths[2]);
			return callback(null);
		}
		path = path.substring(0, path.lastIndexOf("/"));
		db.doc.update({path:path}, {$set:{modifyTime:mTime}}, function(err, modify){
			if(err){
				var paths = path.split("/");
				lock.release("/" + paths[1] + "/" + paths[2]);
				return callback("inner error");
			}
			else{
				that._modifyTime(path, mTime, callback);
			}
		});
	}
	
	this.setNames = function(i, date, records, callback){
		if (i < 0)
			return callback(null, date);
		
		db.user.findOne({_id:records[i].userId}, {name:1}, function (err, user){
			//console.log(user);
			if (err)
				return callback("inner error");
			if (!user)
				return callback("inner error");
				
			date[i] = {};
			date[i].startDate = records[i].modifyTime;
			date[i].asset = {};
			if (i == 0){
				date[i].headline = "Create";
				date[i].text = "By " + user.name;
			}
			else{
				if (records[i].type == "modify"){
					date[i].headline = "Modify";
					date[i].text = records[i].modifyCode + " codes, " + records[i].modifyComment + " comments by " + user.name;
				}
				if (records[i].type == "share"){
					date[i].headline = "Share";
					date[i].text = user.name;
					userDAO.getNameById(records[i].toUserId, function (err, toUser){
						if (err)
							return callback("inner error");
						date[i].text = date[i].text + " shared this file to " + toUser.name;
						that.setNames(i - 1, date, records, callback);
					});
					return;
				}
				if (records[i].type == "transfer"){
					date[i].headline = "Transfer";
					date[i].text = user.name;
					userDAO.getNameById(records[i].toUserId, function (err, toUser){
						if (err)
							return callback("inner error");
						date[i].text = date[i].text + " transferred this file to " + toUser.name;
						that.setNames(i - 1, date, records, callback);
					});
					return;
				}
			}
			that.setNames(i - 1, date, records, callback);
		});
	};
}

DocDAO.prototype.createDoc = function(userId, path, type, callback){
	var that = this;
	var reg = /^\/[a-zA-Z0-9]+((\/[^.\/@\\]+[^@\/\\]*[^.\/@\\]+)|(\/[^.\/@\\]))+$/
	if((!reg.test(path) || (path.substring(path.lastIndexOf("/")).length > 33))){
		return callback("illegal file name");
	}
	var paths = path.split("/");
	var rootPath = "/" + paths[1] + "/" + path[2];

	lock.acquire(rootPath, function(){
		db.user.findOne({_id:userId}, {docs:1, name:1, _id:0}, function(err, reply){
			if(err){
				lock.release(rootPath);
				return callback("inner error");
			}
			else if(!reply){
				lock.release(rootPath);
				return callback("invalid user id");
			}

			if(reply.name != paths[1]){
				lock.release(rootPath);
				return callback("unauthorize");
			}

			db.doc.findOne({path:path}, {_id:1}, function(err, doc){
				if(err){
					lock.release(rootPath);
					return callback("inner error");
				}
				if(doc){
					lock.release(rootPath);
					return callback("file exists");
				}
				else{
					if(paths.length == 3){
						if(type == "dir"){
							var cTime = new Date().getTime();
							db.doc.insert({path:path, type:"dir", owner:userId, members:[], docs:[], permission:"private", createTime:cTime, modifyTime:cTime}, function(err, newDir){
								if(err){
									lock.release(rootPath);
									return callback("inner error");
								}
								else{
									db.user.update({_id:userId}, {$push:{docs:newDir[0]._id}}, function(err, reply){
										if(err){
											lock.release(rootPath);
											return callback("inner error");
										}
										else{
											lock.release(rootPath);
											return callback(null, newDir[0].createTime, null);
										}
									});
								}
							});
						}
						else{
							var cTime = new Date().getTime();
							db.doc.insert({path:path, type:"doc", owner:userId, members:[], revisions:[], permission:"private", createTime:cTime, modifyTime:cTime}, function(err, newDoc){
								if(err){
									lock.release(rootPath);
									return callback("inner error");
								}
								else{
									db.user.update({_id:userId}, {$push:{docs:newDoc[0]._id}}, function(err, reply){
										if(err){
											lock.release(rootPath);
											return callback("inner error");
										}
										else{
											db.revision.insert({
												doc:newDoc[0]._id,
												revision:1,
												createTime:new Date().getTime(),
												creater:userId,
												modifyTime:new Date().getTime(),
												modifier:userId,
												content:""
											}, function(err,revision){
												if(err){
													lock.release(rootPath);
													return callback("inner error");
												}
												else{
													db.doc.update({_id:newDoc[0]._id}, {$push:{revisions:revision[0]._id}}, function(err, reply){
														if(err){
															lock.release(rootPath);
															return callback("inner error");
														}
														else{
															lock.release(rootPath);
                              return callback(null, newDoc[0].createTime, newDoc[0]._id);
														}
													});
												}
											});
										}
									});
								}
							});
						}
					}
					else{
						var pos = path.lastIndexOf("/");
						var prePath = path.substring(0, pos);

						db.doc.findOne({path:prePath, type:"dir"}, function(err, parentDir){
							if(err){
								lock.release(rootPath);
								return callback("inner error");
							}
							else if(!parentDir){
								lock.release(rootPath);
								return callback("invalid parent path");
							}
							else{
								if(type == "dir"){
									var cTime = new Date().getTime();
									db.doc.insert({path:path, type:"dir", docs:[], createTime:cTime, modifyTime:cTime}, function(err, newDir){
										if(err){
											lock.release(rootPath);
											return callback("inner error");
										}
										else{
											db.doc.update({_id:parentDir._id}, {$push:{docs:newDir[0]._id}}, function(err, reply){
												if(err){
													lock.release(rootPath);
													return callback("inner error");
												}
												else{
													lock.release(rootPath);
													return callback(null, newDir[0].createTime, null);
												}
											});
										}
									});
								}
								else{
									var cTime = new Date().getTime();
									db.doc.insert({path:path, type:"doc", revisions:[], createTime:cTime, modifyTime:cTime}, function(err, newDoc){
										if(err){
											lock.release(rootPath);
											return callback("inner error");
										}
										else{
											db.doc.update({_id:parentDir._id}, {$push:{docs:newDoc[0]._id}}, function(err, reply){
												if(err){
													lock.release(rootPath);
													return callback("inner error");
												}
												else{
													db.revision.insert({
														doc:newDoc[0]._id,
														revision:1,
														createTime:new Date().getTime(),
														creater:userId,
														modifyTime:new Date().getTime(),
														modifier:userId,
														content:""
													}, function(err,revision){
														if(err){
															lock.release(rootPath);
															return callback("inner error");
														}
														else{
															db.doc.update({_id:newDoc[0]._id}, {$push:{revisions:revision[0]._id}}, function(err, reply){
																if(err){
																	lock.release(rootPath);
																	return callback("inner error");
																}
																else{
																	lock.release(rootPath);
																	return callback(null, newDoc[0].createTime, newDoc[0]._id);
																}
															});
														}
													});
												}
											});
										}
									});
								}
							}
						});
					}
				}
			});
		});
	});
};

DocDAO.prototype.deleteDoc = function(userId, path, callback){
	var that = this;
	function _deleteDocFromMember(idArr, docId, deleteMemberCallback){
		var counter = 0;
		if(counter == idArr.length){
			return deleteMemberCallback();
		}

		for(var i = 0;i < idArr.length;++i){
			var id = idArr[i];
			if(that.innerError){
				return;
			}
			db.user.update({_id:id}, {$pull:{docs:docId}}, function(err, reply){
				if(err){
					that.innerError = true;
					return deleteMemberCallback();
				}
				else{
					counter++;

					if(counter == idArr.length){
						return deleteMemberCallback();
					}
				}
			});
		}
	}

	function _deleterevisions(idArr, deleteVisionCallback){
		var counter = 0;
		if(counter == idArr.length){
			return deleteVisionCallback();
		}

		for(var i = 0;i < idArr.length;++i){
			var id = idArr[i];
			if(that.innerError){
				return;
			}
			db.revision.remove({_id:id}, function(err, reply){
				if(err){
					that.innerError = true;
					return deleteVisionCallback();
				}
				else{
					counter++;
					
					if(counter == idArr.length){
						return deleteVisionCallback();
					}
				}
			});
		}
	}

	function _deleteDocs(idArr, deleteCallback){
		if(!(idArr instanceof Array)){
			var arr = new Array();
			arr.push(idArr);
			idArr = arr;
		}

		var counter = 0;
		if(counter == idArr.length){
			return deleteCallback();
		}

		for(var i = 0;i < idArr.length;i++){
			if(that.innerError){
				return;
			}

			db.doc.findOne({_id:idArr[i]}, {type:1, docs:1, revisions:1}, function(err, reply){
				if(err){
					that.innerError = true;
					return deleteCallback();
				}
				else if(!reply){
					that.innerError = true;
					return deleteCallback();
				}
				else{
					if(reply.type == "doc"){
						var subIdArr = reply.revisions;
						db.doc.remove({_id:reply._id}, function(err, reply){
							if(err){
								that.innerError = true;
								return deleteCallback();
							}
							else{
								_deleterevisions(subIdArr, function dvcb(){
									counter++;

									if(counter == idArr.length){
										return deleteCallback();
									}
								});
							}
						});
					}
					else{
						var subIdArr = reply.docs;
						db.doc.remove({_id:reply._id}, function(err, reply){
							if(err){
								that.innerError = true;
								return deleteCallback();
							}
							else{
								_deleteDocs(subIdArr, function dcb(){
									counter++;

									if(counter == idArr.length){
										return deleteCallback();
									}
								});
							}
						});
					}
				}
			});
		}
	}

	var reg = /^\/[a-zA-Z0-9]+((\/[^.\/@\\]+[^@\/\\]*[^.\/@\\]+)|(\/[^.\/@\\]))+$/
	if((!reg.test(path) || (path.substring(path.lastIndexOf("/")).length > 33))){
		return callback("illegal file name");
	}

	var paths = path.split("/");
	if(paths.length < 3){
		return callback("wrong path");
	}
	var rootPath = "/" + paths[1] + "/" + paths[2];

	lock.acquire(rootPath, function(){
		db.doc.findOne({path:rootPath}, {owner:1, members:1, permission:1}, function(err, rootDir){
			if(err){
				lock.release(rootPath);
				return callback("inner error");
			}
			else if(!rootDir){
				lock.release(rootPath);
				return callback("invalid root path");
			}
			else if(rootDir.permission == "locked"){
				lock.release(rootPath);
				return callback("doc locked");
			}
			else if(rootDir.owner.toString() != userId.toString()){
				lock.release(rootPath);
				return callback("unactivated");
			}
			else{
				db.doc.findOne({path:path}, {_id:1}, function(err, doc){
					if(err){
						lock.release(rootPath);
						return callback("inner error");
					}
					else if(!doc){
						lock.release(rootPath);
						return callback("file doesn't exists");
					}
					else{
						var pos = path.lastIndexOf("/");
						var parentPath = path.substring(0, pos);
						var members = rootDir.members;

						if(paths.length == 3){
							db.user.update({_id:userId}, {$pull:{docs:doc._id}}, function(err, reply){
								if(err){
									lock.release(rootPath);
									return callback("inner error");
								}
								else{
									that.innerError = false;
									_deleteDocFromMember(members, doc._id, function dmcb(){
										if(that.innerError){
											that.innerError = false;
											lock.release(rootPath);
											return callback("inner error");
										}
										else{
											that.innerError = false;
											_deleteDocs(doc._id, function dcb(){
												if(that.innerError){
													that.innerError = false;
													lock.release(rootPath);
													return callback("inner error");
												}
												else{
													var mTime = new Date().getTime();
													that._modifyTime(path, mTime, callback);
												}
											});
										}
									});
								}
							});
						}
						else{
							db.doc.update({path:parentPath}, {$pull:{docs:doc._id}}, function(err, reply){
								if(err){
									lock.release(rootPath);
									return callback("inner error");
								}
								else{
									that.innerError = false;
									_deleteDocs(doc._id, function dcb(){
										if(that.innerError){
											that.innerError = false;
											lock.release(rootPath);
											return callback("inner error");
										}
										else{
											var mTime = new Date().getTime();
											that._modifyTime(path, mTime, callback);
										}
									});
								}
							});
						}
					}
				});
			}
		});
	});
};

DocDAO.prototype.moveDoc = function(userId, path, newPath, callback){
	var that = this;
	function _moveDoc(idArr, oldPath, newPath, moveDocCallback){
		if(!(idArr instanceof Array)){
			var arr = new Array();
			arr.push(idArr);
			idArr = arr;
		}
		
		var counter = 0;
		if(counter == idArr.length){
			return moveDocCallback();
		}

		for(var i = 0;i < idArr.length;++i){
			if(that.innerError){
				return;
			}
			db.doc.findOne({_id:idArr[i]}, {path:1, type:1, docs:1}, function(err, reply){
				if(err){
					that.innerError = true;
					return moveDocCallback();
				}
				else if(!reply){
					that.innerError = true;
					return moveDocCallback();
				}

				if(reply.type == "doc"){
					db.doc.update({_id:reply._id}, {$set:{path:reply.path.replace(oldPath, newPath)}}, function(err, reply){
						if(err){
							that.innerError = true;
							return moveDocCallback();
						}
						else{
							counter++;

							if(counter == idArr.length){
								return moveDocCallback();
							}
						}
					});
				}
				else{
					var docs = reply.docs;
					db.doc.update({_id:reply._id}, {$set:{path:reply.path.replace(oldPath, newPath)}}, function(err, reply){
						if(err){
							that.innerError = true;
							return moveDocCallback();
						}
						else{
							_moveDoc(docs, oldPath, newPath, function mdcb(){
								counter++;

								if(counter == idArr.length){
									return moveDocCallback();
								}
							});
						}
					});
				}
			});
		}
	}

	var reg = /^\/[a-zA-Z0-9]+((\/[^.\/@\\]+[^@\/\\]*[^.\/@\\]+)|(\/[^.\/@\\]))+$/
	if((!reg.test(path) || (path.substring(path.lastIndexOf("/")).length > 33))){
		return callback("illegal file name");
	}
	if(!reg.test(newPath) || (newPath.substring(newPath.lastIndexOf("/")).length > 33)){
		return callback("illegal new path");
	}
	if(path == newPath){
		return callback("no sense");
	}
	if(path.substring(0, path.lastIndexOf("/")) != newPath.substring(0, newPath.lastIndexOf("/"))){
		return callback("can not move file");
	}

	var paths = path.split("/");
	var newPaths = newPath.split("/");
	var rootPath = "/" + paths[1] + "/" + paths[2];
	var newRootPath = "/" + newPaths[1] + "/" + newPaths[2]; 

	if(lock.test(newRootPath)){
		return callback("conflict");
	}
	lock.acquire(rootPath, function(){
		db.user.findOne({_id:userId}, {name:1}, function(err, user){
			if(err){
				lock.release(rootPath);
				return callback("inner error");
			}
			else if(!user){
				lock.release(rootPath);
				return callback("invalid user id");
			}
			else if(user.name != paths[1]){
				lock.release(rootPath);
				return callback("unauthorized");
			}

			db.doc.findOne({path:path}, {_id:1}, function(err, doc){
				if(err){
					lock.release(rootPath);
					return callback("inner error");
				}
				else if(!doc){
					lock.release(rootPath);
					return callback("file doesn't exists");
				}
				else{
					if((newPaths.length == 3) && (paths.length != 3)){		//move to root
						var pos = path.lastIndexOf("/");
						var parentPath = path.substring(0, pos);

						db.doc.findOne({path:newPath}, {_id:1}, function(err, reply){
							if(err){
								lock.release(rootPath);
								return callback("inner error");
							}
							else if(reply){			//exists
								lock.release(rootPath);
								return callback("conflict");
							}
							else{
								db.user.update({_id:userId}, {$push:{docs:doc._id}}, function(err, reply){
									if(err){
										lock.release(rootPath);
										return callback("inner error");
									}
									else{
										db.doc.update({path:parentPath, type:"dir"}, {$pull:{docs:doc._id}}, function(err, reply){
											if(err){
												lock.release(rootPath);
												return callback("inner error");
											}
											else{
												var rootDocPath = "/" + paths[1] + "/" + paths[2];

												db.doc.findOne({path:rootDocPath, type:"dir"}, {owner:1, members:1, permission:1}, function(err, rootDir){
													if(err){
														lock.release(rootPath);
														return callback("inner error");
													}
													else if(!rootDir){
														lock.release(rootPath);
														return callback("invalid");
													}
													else{
														db.doc.update({_id:doc._id}, {$set:{owner:rootDir.owner, members:rootDir.members, permission:rootDir.permission}}, function(err, reply){
															if(err){
																lock.release(rootPath);
																return callback("inner error");
															}
															else{
																that.innerError = false;
																_moveDoc(doc._id, path, newPath, function mdcb(){
																	if(that.innerError){
																		that.innerError = false;
																		lock.release(rootPath);
																		return callback("inner error");
																	}
																	else{
																		lock.release(rootPath);
																		return callback(null);
																	}
																});
															}
														});
													}
												});
											}
										});
									}
								});
							}
						});
					}
					else if((paths.length == 3) && (newPaths.length != 3)){			//remove from root

						db.doc.findOne({path:newPath}, {_id:1}, function(err, reply){
							if(err){
								lock.release(rootPath);
								return callback("inner error");
							}
							else if(reply){
								lock.release(rootPath);
								return callback("file exists");
							}
							else{
								var newPos = newPath.lastIndexOf("/");
								var parentPath = newPath.substring(0, newPos);

								db.user.update({_id:userId}, {$pull:{docs:doc._id}}, function(err, reply){
									if(err){
										lock.release(rootPath);
										return callback("inner error");
									}
									else{
										db.doc.update({path:parentPath, type:"dir"}, {$push:{docs:doc._id}}, function(err, reply){
											if(err){
												lock.release(rootPath);
												return callback("inner error");
											}
											else{
												db.doc.update({_id:doc._id}, {$unset:{members:1, permission:1, owner:1}}, function(err, reply){
													if(err){
														lock.release(rootPath);
														return callback("inner error");
													}
													else{
														that.innerError = false;
														_moveDoc(doc._id, path, newPath, function mdcb(){
															if(that.innerError){
																that.innerError = false;
																lock.release(rootPath);
																return callback("inner error");
															}
															else{
																lock.release(rootPath);
																return callback(null);
															}
														});
													}
												});
											}
										});
									}
								});
							}
						});
					}
					else if((paths.length == 3) && (newPaths.length == 3)){
						var pos = path.lastIndexOf("/");
						var parentPath = path.substring(0, pos);

						db.doc.findOne({path:newPath}, {_id:1}, function(err, reply){
							if(err){
								lock.release(rootPath);
								return callback("inner error");
							}
							else if(reply){
								lock.release(rootPath);
								return callback("file exists");
							}
							else{
								that.innerError = false;
								_moveDoc(doc._id, path, newPath, function mdcb(){
									if(that.innerError){
										that.innerError = false;
										lock.release(rootPath);
										return callback("inner error");
									}
									else{
										lock.release(rootPath);
										return callback(null);
									}
								});
							}
						});
					}
					else{
						var pos = path.lastIndexOf("/");
						var parentPath = path.substring(0, pos);
						var newPos = newPath.lastIndexOf("/");
						var newParentPath = newPath.substring(0, newPos);

						db.doc.findOne({path:newPath}, {_id:1}, function(err, reply){
							if(err){
								lock.release(rootPath);
								return callback("inner error");
							}
							else if(reply){
								lock.release(rootPath);
								return callback("file exists");
							}
							else{
								db.doc.update({path:parentPath, type:"dir"}, {$pull:{docs:doc._id}}, function(err, reply){
									if(err){
										lock.release(rootPath);
										return callback("inner error");
									}
									else{
										db.doc.update({path:newParentPath, type:"dir"}, {$push:{docs:doc._id}}, function(err, reply){
											if(err){
												lock.release(rootPath);
												return callback("inner error");
											}
											else{
												that.innerError = false;
												_moveDoc(doc._id, path, newPath, function mdcb(){
													if(that.innerError){
														that.innerError = false;
														lock.release(rootPath);
														return callback("inner error");
													}
													else{
														lock.release(rootPath);
														return callback(null);
													}
												});
											}
										});
									}
								});
							}
						});
					}
				}
			});
		});
	});
};

DocDAO.prototype.addMember = function(userId, path, memberName, callback){
	var that = this;
	var paths = path.split("/");
	var rootPath = "/" + paths[1] + "/" + paths[2];

	if(paths.length != 3){
		return callback("isn't root file");
	}

	lock.acquire(rootPath, function(){
		db.user.findOne({_id:userId}, {name:1}, function(err, user){
			if(err){
				lock.release(rootPath);
				return callback("inner error");
			}
			else if(!user){
				lock.release(rootPath);
				return callback("invalid user id");
			}
			else if(user.name != paths[1]){
				lock.release(rootPath);
				return callback("unauthorized");
			}
			else if(user.name == memberName){
				lock.release(rootPath);
				return callback("can't add yourself");
			}

			db.user.findOne({name:memberName}, {_id:1, state:1}, function(err, member){
				if(err){
					lock.release(rootPath);
					return callback("inner error");
				}
				else if(!member){
					lock.release(rootPath);
					return callback("member doesn't exists");
				}
				else if(member.state == "locked"){
					lock.release(rootPath);
					return callback("unauthorized");
				}
				db.doc.findOne({path:path}, {_id:1, members:1}, function(err, doc){
					if(err){
						lock.release(rootPath);
						return callback("inner error");
					}
					else if(!doc){
						lock.release(rootPath);
						return callback("file doesn't exists");
					}
					
					var uId = member._id.toString();
					for(i in doc.members){
						if(doc.members[i].toString() == uId){
							lock.release(rootPath);
							return callback("member already exists");
						}
					}

					db.user.update({_id:member._id}, {$push:{docs:doc._id}}, function(err, reply){
						if(err){
							lock.release(rootPath);
							return callback("inner error");
						}

						db.doc.update({_id:doc._id}, {$push:{members:member._id}}, function(err, reply){
							if(err){
								lock.release(rootPath);
								return callback("inner error");
							}
							else{
								db.doc.findOne({_id:doc._id}, function (err, myDoc){
									if (err){
										lock.release(rootPath);
										return callback("inner error");
									}
									lock.release(rootPath);
									return callback(null, myDoc);
								});
							}
						});
					});
				});
			});
		});
	});
};

DocDAO.prototype.removeMember = function(userId, path, memberName, callback){
	var that = this;
	var paths = path.split("/");
	var rootPath = "/" + paths[1] + "/" + paths[2];

	if(paths.length != 3){
		return callback("isn't root file");
	}

	lock.acquire(rootPath, function(){
		db.user.findOne({_id:userId}, {name:1}, function(err, user){
			if(err){
				lock.release(rootPath);
				return callback("inner err");
			}
			else if(!user){
				lock.release(rootPath);
				return callback("invalid user id");
			}
			else if(user.name != paths[1]){
				lock.release(rootPath);
				return callback("unauthorized");
			}

			db.doc.findOne({path:path}, {_id:1}, function(err, doc){
				if(err){
					lock.release(rootPath);
					return callback("inner error");
				}
				else if(!doc){
					lock.release(rootPath);
					return callback("not found");
				}
				
				db.user.findOne({name:memberName}, {state:1}, function(err, member){
					if(err){
						lock.release(rootPath);
						return callback("inner error");
					}
					else if(!member){
						lock.release(rootPath);
						return callback("member doesn't exists");
					}
					else if(member.state == "locked"){
						lock.release(rootPath);
						return callback("unauthorized");
					}
					db.doc.update({_id:doc._id}, {$pull:{members:member._id}}, function(err, reply){
						if(err){
							lock.release(rootPath);
							return callback("inner error");
						}

						db.user.update({_id:member._id}, {$pull:{docs:doc._id}}, function(err, reply){
							if(err){
								lock.release(rootPath);
								return callback("inner error");
							}
							lock.release(rootPath);
							return callback(null);
						});
					});
				});
			});
		});
	});
};

DocDAO.prototype.getDocByPath = function(userId, path, callback){
	var that = this;
	var trueResult = [];
	var returnResult;
	var userIds = [];
	var ownerId;
	var dId = userId.toString();
	var flag = 0;
	var paths = path.split('/');
	if (paths.length == 3){
		//root
		db.doc.findOne({path:path}, {_id:0}, function(err,result){
			if (err){
				return callback("inner error",null);
			}
			if (!result){
				return callback("wrong path",null);
			}
			for (member in result.members){
				if (result.members[member].toString() == dId){
					flag = 1;
					break;
				}
			}
			if (!flag && (userId.toString() != result.owner.toString())){
				return callback("unauthorized",null);
			}
			if (result.type == "doc"){
				returnResult = result;
				ownerId = result.owner;
				userIds.push(ownerId);
				for (id in result.members){
					userIds.push(result.members[id]);
				}
				db.user.find({_id:{$in:userIds}}, {password:0, group:0, createTime:0, docs:0, state:0}, function(err,result){
					if(err){
						return callback("inner error",null);
					}
					if(!result){
						return callback("No These IDs",null);
					}
					for (index in result){
						if(result[index]._id.toString() == ownerId.toString()){
							returnResult.owner = result[index];
							//trueResult.push(result[index]);
							//result.splice(index, 1);
							//break;
						}
						else{
							returnResult.members.push(result[index]);
							returnResult.members.splice(0,1);
						}
					}
					//trueResult.push(result);
					callback(null,returnResult);
				});
			}
			//is dir
			else{
				db.doc.find({_id:{$in:result.docs}}, {revisions:0,_id:0,docs:0}, function(err,docs){
					if (err){
						return callback("inner error");
					}
					//if (!docs){
					//	return callback("invalid");
					//}
					if (docs.length == 0){
						result.docs = [];
					}
					else{
						for (i in docs){
							result.docs.push(docs[i]);
							result.docs.splice(0,1);
						}
					}
					
					//trueResult.push(result);
					returnResult = result;
					ownerId = result.owner;
					userIds.push(ownerId);
					for (id in result.members){
						userIds.push(result.members[id]);
					}
					db.user.find({_id:{$in:userIds}}, {password:0, group:0, createTime:0, docs:0, state:0}, function(err,result){
						if(err){
							return callback("inner error",null);
						}
						if(!result){
							return callback("No These IDs",null);
						}
						for (index in result){
							if(result[index]._id.toString() == ownerId.toString()){
								returnResult.owner = result[index];
								//trueResult.push(result[index]);
								//result.splice(index, 1);
								//break;
							}
							else{
								returnResult.members.push(result[index]);
								returnResult.members.splice(0,1);
							}
						}
						//trueResult.push(result);
						callback(null,returnResult);
					});
				});
			}
		});
	}
	//not root
	else if (paths.length == 2){
		var mydocs = [];
		var userIds = [];
		that.innerError = false;
		db.user.findOne({_id:userId},function(err,user){
			if (err){
				return callback("inner error");
			}
			if (!user){
				return callback("unauthorized");
			}
			if (user.name != paths[1]){
				return callback("unauthorized");
			}
			db.doc.find({_id:{$in : user.docs}}, {revisions:0,_id:0,docs:0}, function(err,docs){
				if (err){
					return callback("inner error");
				}
				if (docs.length == 0){
					docs = [];
					return callback(null,docs);
				}
				var counter = 0;
				var docsPaths = [];
				function t(doc){
					db.user.findOne({_id:doc.owner},{name:1,_id:0,avatar:1},function(err,trueowner){
						if (err){
							that.innerError = true;
						}
						doc.owner = trueowner;
						db.user.find({_id:{$in:doc.members}},{name:1,_id:0,avatar:1},function(err,members){
							if (err){
								that.innerError = true;
							}
							doc.members = members;
							counter++;
							if (counter == docs.length){
								return callback(null ,docs);
							}
						});
					});
					
				}
				for (var i in docs){
					if (that.innerError){
						that.innerError = false;
						return callback("inner error");
					}
					t(docs[i]);
				}
			});
		});
	}
	else {
		var rootpath = '/' + paths[1]  + '/' + paths[2];
		db.doc.findOne({path:rootpath}, {_id:0}, function(err,result){
			if (err){
				return callback("inner error",null);
			}
			if (!result){
				return callback("wrong path",null);
			}
			for (member in result.members){
				if (result.members[member].toString() == dId){
					flag = 1;
					break;
				}
			}
			userIds.push(result.owner);
			for (id in result.members){
				userIds.push(result.members[id]);
			}
			if (!flag && (userId.toString() != result.owner.toString())){
				return callback("unauthorized",null);
			}
			/////////////
			db.doc.findOne({path:path}, {_id:0}, function(err,mydoc){
				if (err){
					return callback("inner error");
				}
				if (!mydoc){
					return callback("invalid");
				}
				returnResult = mydoc;
				//returnResult.owner = paths[1];
				returnResult.members = [];
				if(mydoc.type == "doc"){
					db.user.find({_id:{$in:userIds}}, {name:1,_id:0,avatar:1}, function(err,members){
						if(err){
							return callback("inner error",null);
						}
						if(members.length == 0){
							return callback("NO OWNER",null);
						}
						//returnResult.members = members;
						for (index in members){
							if(members[index]._id.toString() == result.owner.toString()){
								returnResult.owner = members[index];
							}
							else{
								returnResult.members.push(members[index]);
								//returnResult.members.splice(0,1);
							}
						}	
						callback(null,returnResult);
					});
				}
				else{
					db.doc.find({_id:{$in:mydoc.docs}}, {revisions:0,_id:0,docs:0}, function(err,docs){
						if (err){
							return callback("inner error");
						}
						if (docs.length == 0){
							docs = [];
						}
						returnResult.docs = docs;
						returnResult.members = [];
						//returnResult.owner = returnResult.path.split('/')[1];
						db.user.find({_id:{$in:userIds}}, {name:1,_id:1,avatar:1}, function(err,members){
							if(err){
								return callback("inner error",null);
							}
							if(members.length == 0){
								return callback("NO OWNER");
							}
							//returnResult.members = members;
							for (index in members){
								if(members[index]._id.toString() == result.owner.toString()){
									returnResult.owner = members[index];
								}
								else{
									returnResult.members.push(members[index]);
									//returnResult.members.splice(0,1);
								}
							}	
							callback(null,returnResult);
						});
					});
				}
			});
		});
	}
};

DocDAO.prototype.setPermission = function(userId, path, permission, callback){
	var that = this;
	var paths = path.split("/");
	var rootPath = "/" + paths[1] + "/" + paths[2];
	var dId = userId.toString();
	var flag = 0;
	if (paths.length != 3){
		return callback("unauthorized");
	}

	lock.acquire(rootPath, function(){
		db.doc.findOne({path:path},function(err,result){
			if (err){
				lock.release(rootPath);
				return ("inner error");		
			}
			if (!result){
				lock.release(rootPath);
				return callback("unauthorized");
			}
			for (i in result.members){
				if (result.members[i].toString() == dId){
					flag = 1;
					break;
				}
			}
			if (flag == 0  && (userId.toString() != result.owner.toString())){
				lock.release(rootPath);
				return callback("unauthorized");
			}
			db.doc.update({_id:result._id},{
				$set:{
					permission:permission
				}
				},function(err,result){
					if (err){
						lock.release(rootPath);
						return callback("inner error");				
					}
					lock.release(rootPath);
					return callback(null);
				}	
			);
		});
	});
};

DocDAO.prototype.getRevision = function(userId, path, revision, obj, callback){
	var that = this;
	var paths = path.split('/');
	var rootPath = "/" + paths[1] + "/" + paths[2];
	var flag = 0;
	var dId = userId.toString();
	db.doc.findOne({path:rootPath}, {_id:0}, function(err,rootDoc){
		if (err){
			return callback("inner error");
		}
		if (!rootDoc){
			return callback("unauthorized");
		}
		for (i in rootDoc.members){
			if (dId == rootDoc.members[i].toString()){
				flag = 1;
				break;
			}
		}
		if (flag == 0 && (userId.toString() != rootDoc.owner.toString())){
			return callback("unauthorized");
		}
		db.doc.findOne({path:path},function(err, result){
			if (err){
				return callback("inner error");
			}
			if (!result){
				return callback("unauthorized");
			}
			if (result.type == "dir"){
				return callback("DIR!!");
			}
			visionLength = result.revisions.length;
			if (visionLength < revision){
				return callback("out of bound");
			}
			var versionId;
			if (revision == 0){
				versionId = result.revisions[visionLength-1];
			}
			else{
				versionId = result.revisions[revision-1];
			}
			db.revision.findOne({_id:versionId}, {_id:0}, function(err,result){
				if (err){
					return callback("inner error");
				}
				else if (!result){
					return callback("unauthorized");
				}
				return callback(null,result,obj);
			});
		});
	});
};

DocDAO.prototype.commit = function(userId, path, content, callback){
	var that = this;
	var revisionDocId,revisionLength,docValue,myrevisionId;
	var paths = path.split('/');
	var rootpath = '/' + paths[1] + '/' + paths[2];  
	var flag = 0;
	var dId = userId.toString();
	db.doc.findOne({path:rootpath},function(err,myDoc){
		if (err){
			return callback("inner error");
		}
		if (!myDoc){
			return callback("invalid");
		}
		for (i in myDoc.members){
			if (dId == myDoc.members[i].toString()){
				flag = 1;
				break;
			}
		}
		if (!flag && (userId.toString() != myDoc.owner.toString())){
			return callback("unauthorized");
		}
		db.doc.findOne({path:path},function(err,result){
			if (err){
				return callback("inner error");
			}
			if (!result){
				return callback("unauthorized");
			}
			if (result.type == "dir"){
				return callback("dir!!");
			}
			docValue = result;
			revisionDocId = result._id;
			revisionLength = result.revisions.length + 1;
			db.revision.insert({
				doc:revisionDocId,
				revision:revisionLength,
				createTime:new Date().getTime(),
				creater:userId,
				modifyTime:new Date().getTime(),
				modifier:userId,
				content:content
				},
				function(err,revision){
					if (err){
						return callback("inner error");
					}
					db.doc.update({_id:result._id},{
						$push:{revisions:revision[0]._id}
						},
						function(err,result){
							if (err){
								return callback("inner error");
							}
							else{
								var mTime = new Date().getTime();
								that._modifyTime(path + "/.", mTime, callback);
							}
						}
					);
				}
			);
		});
	});
};


DocDAO.prototype.save = function(userId, docId, content, callback){
	var that = this;
	var revisionID;
	var flag = 0;
	var dId = userId.toString();
	db.doc.findOne({_id:docId},function(err,myDoc){
		if (err){
			return callback("inner error");
		}
		if (!myDoc){
			return callback("unauthorized");
		}
		if (myDoc.type == "dir"){
			return callback("dir!!");
		}
		var paths = myDoc.path.split('/');
		var rootpath = '/' + paths[1] + '/' + paths[2];
		lock.acquire(rootpath, function(){
			db.doc.findOne({path:rootpath},function(err,rootDoc){
				if (err){
					lock.release(rootpath);
					return callback("inner error");
				}
				if (!rootDoc){
					lock.release(rootpath);
					return callback("invalid");
				}
				for (i in rootDoc.members){
					if (dId == rootDoc.members[i].toString()){
						flag = 1;
						break;
					}
				}
				if (!flag && (userId.toString() != rootDoc.owner.toString())){
					lock.release(rootpath);
					return callback("unauthorized");
				}
				revisionID = myDoc.revisions[myDoc.revisions.length - 1];
				db.revision.update({_id:revisionID},{
					$set:{
						modifyTime:new Date().getTime(),
						modifier: userId,
						content:content
					}
				}, function(err, result){
					if (err){
						lock.release(rootpath);
						return callback("inner error");
					}
					else{
						var mTime = new Date().getTime();
						that._modifyTime(myDoc.path + "/.", mTime, callback);
					}
				});
			});
		});
	});

};

DocDAO.prototype.findOwner = function(docId, callback){
    db.doc.findOne({_id:docId},function(err,myDoc){
        if (err){
            return callback("inner error");
        }
        if (!myDoc)
            return callback("unauthorized");
        return callback(err, myDoc);
    });
};

DocDAO.prototype.findContent = function(docId, callback){
    db.revision.findOne({doc:docId},function(err,myDoc){
        if (err){
            return callback("inner error");
        }
        if (!myDoc)
            return callback("unauthorized");
        return callback(err, myDoc);
    });
};

DocDAO.prototype.changeOwner = function(userId, path, name, callback){
	var paths = path.split('/');
	var rootpath = '/' + paths[1] + '/' + paths[2];
	
	if (paths.length != 3)
		return callback("isn't root file");
	
	lock.acquire(rootpath, function(){
		db.user.findOne({_id:userId}, function (err, user){
			if (err){
				lock.release(rootpath);
				return callback("inner error");
			}
			if (!user){
				lock.release(rootpath);
				return callback('invalid user');
			}
			if (user.name != paths[1]){
				lock.release(rootpath);
				return callback('unauthorized');
			}
			if (user.name == name) {
				lock.release(rootpath);
				return callback('can not be yourself');
			}
			
			db.user.findOne({name:name}, function(err, member){
				if (err){
					lock.release(rootpath);
					return callback("inner error");
				}
				if (!member){
					lock.release(rootpath);
					return callback('invalid member');
				}
				if (member.state == 'locked'){
					lock.release(rootpath);
					return callback('unauthorized');
				}
				db.doc.findOne({path:path}, function(err, doc){
					if (err){
						lock.release(rootpath);
						return callback("inner error");
					}
					if (!doc){
						lock.release(rootpath);
						return callback('invalid doc');
					}
					
					var newPath = '/' + member.name + '/' + paths[2];
					var members = doc.members;
					for (var i in doc.members){
						if (doc.members[i].toString() == member._id.toString()){
							members.splice(i, 1);
							break;
						}
					}
					db.doc.update({_id:doc._id}, {$set:{members:members, path:newPath, owner:member._id}}, function(err){
						if (err){
							lock.release(rootpath);
							return callback("inner error");
						}
					});
					
					var docs = user.docs;
					for (var i in user.docs)
						if (user.docs[i].toString() == doc._id.toString()){
							docs.splice(i ,1);
							break;
						}
					db.user.update({_id:user._id}, {$set:{docs:docs}}, function(err){
						if (err){
							lock.release(rootpath);
							return callback("inner error");
						}
					});
					
					docs = member.docs;
					for (var i in member.docs)
						if (member.docs[i].toString() == doc._id.toString()){
							docs.splice(i ,1);
							break;
						}
					docs.push(doc._id);
					db.user.update({_id:member._id}, {$set:{docs:docs}}, function(err){
						if (err){
							lock.release(rootpath);
							return callback("inner error");
						}
					});
					db.doc.findOne({_id:doc._id}, function (err, fuckDoc){
						if (err){
							lock.release(rootpath);
							return callback("inner error");
						}
						return callback("changeOwner success", fuckDoc);	
					});
				});
			});
		});
	});
};

DocDAO.prototype.updateRecord = function (userId, docId, modifyTime, result, callback){
	
	db.record.findOne({userId:userId, docId:docId, type:{$in : ["modify", "transfer"]}}, {sort:{$natural:-1}}, function (err, record){
		if (err)
			return callback('inner error');
		if (result.codeLength == 0 && result.commentNum == 0)
			return callback(err);
		if (!record){
			db.record.insert({userId:userId, toUserId:null, docId:docId, modifyTime: modifyTime, modifyCode: result.codeLength, 
				modifyComment: result.commentNum, codeLength: result.codeLength, commentNum: result.commentNum, type:"modify"}, function (err){
				if (err)
					return callback('inner error');
			});
		}
		else{
			var modifyCode = result.codeLength - record.codeLength;
			var modifyComment = result.commentNum - record.commentNum;
			
			if (modifyCode == 0 && modifyComment == 0)
				return callback(err);
			
			db.record.insert({userId:userId, toUserId:null, docId:docId,  modifyTime: modifyTime, modifyCode: modifyCode, 
				modifyComment: modifyComment, codeLength: result.codeLength, commentNum: result.commentNum, type:"modify"}, function (err){
				if (err)
					return callback('inner error');
			});
		}
	});
};

DocDAO.prototype.getTimelineData = function (myDoc, callback){
	//console.log(myDoc);
	var that = this;
	db.record.find({docId:myDoc._id}, function(err, records){
		if (err)
			return callback('inner error');
		
		var result = {};
		var timeline = {};
		var date = new Array(records.length);
		
		if (!records || records.length == 0)
			return callback(err, result);

		that.setNames(records.length - 1, date, records, function(err, date){
			if (err)
				return callback('inner error');
			
			//console.log(date);
			var result = {};
			var timeline = {};
			var codeLength = 0, commentNum = 0;
			var path = myDoc.path;
			var paths = path.split('/');
			var docName = paths[paths.length - 1];
			var modifyTime = 0;
			
			for (var i in records){
				commentNum += records[i].modifyComment;
				if (records[i].userId.toString() == myDoc.owner.toString() && records[i].type != "share")
					codeLength = records[i].codeLength;
				if (records[i].type == "modify")
					modifyTime ++;
			}

			timeline.headline = docName;
			timeline.type = "default";
			timeline.text = "Modified " + modifyTime+ " times. " + codeLength + " codes, " + commentNum + " comments.";
			timeline.startDate = records[records.length - 1].modifyTime;
			timeline.date = date;
			
			result.timeline = timeline;
			
			//console.log(result);
			
			return callback(err, result);
		});
	});
};

DocDAO.prototype.createDocRecord = function (userId, docId, modifyTime, callback){
	//console.log("create");
	db.record.insert({userId:userId, toUserId:null, docId:docId,  modifyTime: modifyTime, modifyCode: 0, 
		modifyComment: 0, codeLength: 0, commentNum: 0, type:"create"}, function (err){
		if (err)
			return callback('inner error');
		callback(err);
	});
};

DocDAO.prototype.transferDocRecord = function (userId, toUserId, docId, modifyTime, callback){
	//console.log("test");
	db.record.findOne({userId:userId, docId:docId, type:{$in:["modify", "transfer"]}}, {sort:{$natural:-1}}, function (err, record){
		if (err)
			return callback("inner error");
			
		var modifyCode;
		
		if (!record)
			modifyCode = 0;
		else
			modifyCode = - record.codeLength;
		
		db.record.insert({userId:userId, toUserId:toUserId, docId:docId,  modifyTime: modifyTime, modifyCode: modifyCode, 
			modifyComment: 0, codeLength: 0, commentNum: record.commentNum, type:"transfer"}, function (err){
			if (err)
				return callback('inner error');
			db.record.findOne({userId:toUserId, docId:docId}, {sort : {$natural: -1}}, function (err, record2){
				if (err)
					return callback('inner error');
					
				var commentNum = 0;
				if (record2)
					commentNum = record2.commentNum;
					
				db.record.insert({userId:toUserId, toUserId:null, docId:docId, modifyTime:modifyTime, modifyCode: -modifyCode,
					modifyComment:0, codeLength: -modifyCode, commentNum: commentNum, type:"modify"}, function (err){
					
					if (err)
						return callback('inner error');
					callback(null);
				});
			});
		});
	});
};

DocDAO.prototype.shareDocRecord = function (userId, toUserId, docId, modifyTime, callback){
	db.record.insert({userId:userId, toUserId:toUserId, docId:docId,  modifyTime: modifyTime, modifyCode: 0, 
		modifyComment: 0, codeLength: 0, commentNum: 0, type:"share"}, function (err){
		if (err)
			return callback('inner error');
		callback(err);
	});
};