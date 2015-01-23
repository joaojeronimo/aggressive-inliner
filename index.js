var url = require('url');
var request = require('request');
var fs = require('fs');
var path = require('path');
var buffer = require('buffer');

var assetCache = {};

module.exports = function inline (basePath, content, cache, callback) {
	if (cache instanceof Function && !callback) {
		callback = cache;
		cache = undefined;
	}

	var remoteQueue = [];
	var stylesheets = content.match(/<link[^>]+?inline.*?>/igm);
	for (var j in stylesheets) {
		var stylesheetPath = /href=["'](.+?)["']/.exec(stylesheets[j])[1];
		var css;
		if (isRemote(stylesheetPath)) {
			if (!(callback instanceof Function)) {
				throw new Error('Needs a callback when inlining remote assets');
			}
			remoteQueue.push({
				tag: stylesheets[j],
				type: 'style',
				addr: pickProtocol(stylesheetPath)
			});
		} else {
			var styleContent = fs.readFileSync(path.resolve(basePath, '..', stylesheetPath), 'utf-8');
			content = content.replace(stylesheets[j], wrapContent(styleContent, 'style'));
		}
	}

	var scripts = content.match(/<script[^>]+?inline.*?>?<\/script>/igm);
	for (var i in scripts) {
		var scriptPath = /src=["'](.+?)["']/.exec(scripts[i])[1];
		var code;
		if (isRemote(scriptPath)) {
			if (!(callback instanceof Function)) {
				throw new Error('Needs a callback when inlining remote assets');
			}
			remoteQueue.push({
				tag: scripts[i],
				type: 'script',
				addr: pickProtocol(scriptPath)
			});
		} else {
			var scriptContent = fs.readFileSync(path.resolve(basePath, '..', scriptPath), 'utf-8');
			scriptContent = scriptContent.replace('</script>', '<\/script>');
			content = content.replace(scripts[i], wrapContent(scriptContent, 'script'));
		}
	}

	(function fetchRemote () {
		if (remoteQueue.length === 0) {
			return;
		}

		function onData (err, res, body) {
			if (err) {
				throw new Error(err);
			}
			if (cache && !assetCache[asset.addr]) {
				assetCache[asset.addr] = body;
			}
			content = content.replace(asset.tag, wrapContent(body, asset.type));
			remoteQueue.shift();
			fetchRemote();
		}

		var asset = remoteQueue[0];
		if (cache && assetCache[asset.addr]) {
			onData(null, null, assetCache[asset.addr]);
		} else {
			console.log('fetching:', asset.addr);
			request(asset.addr, onData);
		}
	})();

	if (remoteQueue.length === 0) {
		return callback(null, content);
		//return content;
	}
};

function isRemote (path) {
	return /^\/\//gm.test(path) || /^https\:\/\//.test(path) || /^http\:\/\//.test(path);
}

function pickProtocol(path) {
	if (/^\/\//gm.test(path)) {
		path = 'https:'+path;
	}
	return path;
}

function wrapContent (content, tag) {
	if (tag === 'script') {
		return '<script src='+javascriptDataUri(content)+'></script>';
	}

	return '<'+tag+'>'+content+'</'+tag+'>';
}

function javascriptDataUri (content) {
	return 'data:application/javascript;charset=utf-8;base64,'+(new Buffer(content)).toString('base64');
}
