###rwlock-plus

Extends [rwlock](https://github.com/71104/rwlock) with lock expiration and automatic invocation of a callback.

###usage

See [rwlock](https://github.com/71104/rwlock) for the basic usage. This changes the API:

	var RWlock = require('rwlock-plus')

	var lock = new RWLock();
	lock.readLock(key, callback, function (release) {
	    // do stuff

	    release();
	});

`key` is required; any locks on the same key are held across any other locks requested for the same key.

When `release` is called, it also invokes `callback`. This ensures you will always release your locks before calling the callback. In situations
where you want to call the callback without release a lock, e.g. you return a resource that remains open for a while such a stream, you can omit this
parameter:
	
	var lock = new RWLock();
	..

	function GetStream(err, callback) {	
		lock.readLock(key, null, function (release) {
		    var stream = GetStream();
		    stream.on('end', release);
		   	callback(stream);
		});
	});

Note that this introduces risk of locks never being relased, if, for example, the stream never emits 'end.' Address this with a failsafe:

    var lock = new RWLock(10000); // 10 second maximum time to hold a lock

The same code above is fine now: if 10 seconds pass, the lock will be released. If you need to do some cleanup or special handling when the timeout occurs, you can add it as the callback:

	function GetStream(err, callback) {	

		function errCallback(err) {
			if (err) logger.warn("Stream timed out")
		}

		lock.readLock(key, errCallback, function (release) {
		    var stream = GetStream();
		    stream.on('end', release);
		    callback(stream);
		});
	});

Note that the callback still gets called both on your deliberate `release` as a result of an "on stream end" event, as well as the timeout. But when the timeout invokes the callback, an error is returned. Therefore, to be sure you only call the original callback once, you should always test for an error if using a callback in addition to invoking the original callback before releasing the lock.


