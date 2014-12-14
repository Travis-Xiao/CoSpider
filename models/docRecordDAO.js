module.exports = DocRecordDAO;
var db = require('./db.js');
var Lock = require('./lock.js');
var UserDAO = require('./userDAO');
var DocDAO = require('./docDAO');

var lock = new Lock();
var userDAO = new UserDAO();
var docDAO = new DocDAO();

var that = this;

function DocRecordDAO(){
	if(!(this instanceof DocRecordDAO)){
		return new DocRecordDAO();
	}
	this.innerError = false;
}

DocRecordDAO.prototype.updateRecord = function (userId, docId, modifyTime, result, callback){
	
	db.docRecord.findOne({
		userId:userId, 
		docId:docId, 
		type:{
			$in : ["modify", "transfer"]
		}
	}, {
		sort:{
			$natural:-1
		}
	}, function (err, docRecord){
		if (err)
			return callback('inner error');
		if (!docRecord){
			if (result == 0)
				return callback(err);
			db.docRecord.insert({
				userId:userId, 
				toUserId:null, 
				docId:docId, 
				modifyTime: modifyTime, 
				modifyCode: result, 
				codeLength: result, 
				type:"modify"
			}, function (err){
				if (err)
					return callback('inner error');
			});
		}
		else{
			var modifyCode = result - docRecord.codeLength;
			
			if (modifyCode == 0)
				return callback(err);
			
			db.docRecord.insert({
				userId:userId, 
				toUserId:null, 
				docId:docId, 
				modifyTime: modifyTime, 
				modifyCode: modifyCode, 
				codeLength: result, 
				type:"modify"
			}, function (err){
				if (err)
					return callback('inner error');
			});
		}
	});
};

DocRecordDAO.prototype.getTimelineData = function (myDoc, callback){
	//console.log(myDoc);
	that = this;
	db.docRecord.find({
		docId:myDoc._id
	}, function(err, records){
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
			var codeLength = 0, noteNum = 0;
			var path = myDoc.path;
			var paths = path.split('/');
			var docName = paths[paths.length - 1];
			var modifyTime = 0;
			
			for (var i in records){
				if (records.type == "note")
					noteNum ++;
				if (records[i].userId.toString() == myDoc.owner.toString() && records[i].type != "share")
					codeLength = records[i].codeLength;
				if (records[i].type == "modify")
					modifyTime ++;
			}

			timeline.headline = docName;
			timeline.type = "default";
			timeline.text = "Modified " + modifyTime+ " times. " + codeLength + " codes, " + noteNum + " notes.";
			timeline.startDate = records[records.length - 1].modifyTime;
			timeline.date = date;
			
			result.timeline = timeline;
			
			//console.log(result);
			
			return callback(err, result);
		});
	});
};

DocRecordDAO.prototype.createDocRecord = function (userId, docId, modifyTime, callback){
	//console.log("create");
	db.docRecord.insert({
		userId:userId, 
		toUserId:null, 
		docId:docId,  
		modifyTime: modifyTime, 
		modifyCode: 0, 
		codeLength: 0, 
		type:"create"
	}, function (err){
		if (err)
			return callback('inner error');
		callback(err);
	});
};

DocRecordDAO.prototype.transferDocRecord = function (userId, toUserId, docId, modifyTime, callback){
	//console.log("test");
	db.docRecord.findOne({
		userId:userId, 
		docId:docId, 
		type:{
			$in:["modify", "transfer"]
		}
	}, {
		sort:{
			$natural:-1
		}
	}, function (err, docRecord){
		if (err)
			return callback("inner error");
			
		var modifyCode;
		
		if (!docRecord)
			modifyCode = 0;
		else
			modifyCode = - docRecord.codeLength;
		
		db.docRecord.insert({
			userId:userId, 
			toUserId:toUserId, 
			docId:docId,  
			modifyTime: modifyTime, 
			modifyCode: modifyCode, 
			codeLength: 0, 
			type:"transfer"
		}, function (err){
			if (err)
				return callback('inner error');
				
			db.docRecord.findOne({
				userId:toUserId, 
				docId:docId
			}, {
				sort:{
					$natural: -1
				}
			}, function (err, record2){
				if (err)
					return callback('inner error');
					
				var commentNum = 0;
				if (record2)
					commentNum = record2.commentNum;
					
				db.docRecord.insert({
					userId:toUserId, 
					toUserId:null, 
					docId:docId, 
					modifyTime:modifyTime, 
					modifyCode: -modifyCode,
					codeLength: -modifyCode, 
					type:"modify"
				}, function (err){
					if (err)
						return callback('inner error');
					callback(null);
				});
			});
		});
	});
};

DocRecordDAO.prototype.shareDocRecord = function (userId, toUserId, docId, modifyTime, callback){
	db.docRecord.insert({
		userId:userId, 
		toUserId:toUserId, 
		docId:docId, 
		modifyTime: modifyTime, 
		modifyCode: 0, 
		codeLength: 0, 
		type:"share"
	}, function (err){
		if (err)
			return callback('inner error');
		callback(err);
	});
};

DocRecordDAO.prototype.addNoteRecord = function (userId, docId, modifyTime, callback){
	db.docRecord.insert({
		userId:userId, 
		toUserId:null, 
		docId:docId, 
		modifyTime:modifyTime, 
		modifyCode:0, 
		codeLength:0, 
		type:"note"
	}, function (err){
		if (err)
			return callback('inner error');
		callback(err);
	});
};

	
DocRecordDAO.prototype.setNames = function(i, date, records, callback){
	if (i < 0)
		return callback(null, date);
	
	db.user.findOne({
		_id:records[i].userId
	}, {
		name:1
	}, function (err, user){
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
				date[i].text = "Modified " + records[i].modifyCode + " codes by " + user.name;
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
			if (records[i].type == "note"){
				date[i].headline = "Note";
				date[i].text = user.name + "added an useful note.";
			}
		}
		that.setNames(i - 1, date, records, callback);
	});
};