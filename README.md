###rwlock-plus

Extends [rwlock](https://github.com/71104/rwlock) with lock expiration and automatic invocation of a callback. 

###usage

See [rwlock](https://github.com/71104/rwlock) for more details on the general locking concepts. An instance of rwlock-plus has this API:

    locker.readLock(key, releaseCallback, lockObtainedCallback)
    locker.writeLock(key, releaseCallback, lockObtainedCallback)

* A *read lock* prevents a *write lock* from being obtained until it is released. 
* A *write lock* prevents any other lock from being obtained until it is released.

When locks are requested but not obtained, they are queued, and provisioned to the requester in the order received. This behavior is applied across each unique *key*. That is, locks obtained with different keys are completely independent.

When a lock is obtained, the `lockObtainedCallback` is invoked with a single parameter, a function `release()` which should be invoked to release the lock. If a `releaseCallback` was provided, then invoking `release` will release the lock and also invoke `releaseCallback` with any arguments provided. This encapsulates a common use case - releasing the lock and subsequently invoking the method's original callback.

Arguments passed to `release` will be forwarded to `releaseCallback`. Therefore, if the original callback has an error argument as its first parameter, calling `release` with an error will respect the underlying api and pass the error the the callback. Since there are no error conditions associated with the lock obtained callback, there is no error argument.

#####expirations

Locks can have expirations, after a duration defined when creating an instance of `rwlock-plus`. If an expiration is defined, it will cause any unreleased lock to automatically be released *if another lock is waiting for the resource.*  That is, if nothing else has requested a lock for a given resource, then the lock will never expire automatically. However, if something subsequently requests a lock on a resource with an expired lock, it will be release immediately. When a lock is released as a result of expiration, the original callback (if provided) will be invoked with an error.

	var Lock = require('rwlock-plus')
    ...

	var lock = new Lock();

	lock.readLock('my-resource', callback, function (release) {
	    // do stuff

	    release();
	});


`key` is required; any locks on the same key are held across any other locks requested for the same key.

*Why doesn't a lock just automatcally call the release whenever the timeout passes?* The underlying assumption is that if nobody is waiting for a lock, there's no reason to create an expiration event. This permits a more forgiving approach to resource allocation. It also allows significant optimization by eliminating the need for timers for the first lock obtained -- perhaps most locks, depending on actual usage. That is, a timer is not set when a lock is provided; rather, one is only set if a lock is requested that *could not be obtained*. So, unless a queue exists for a given resource, a timer is never needed.

#####calling back before releasing the lock

When `release` is called, it also invokes `callback`. This ensures you will always release your locks before calling the callback. In situations
where you want to call the callback without release a lock, e.g. you return a resource immediately that must remain locked until some activity completes, such a stream, you can omit this parameter:
	
	var lock = new Lock();

	function GetStream(err, callback) {	
		lock.readLock('my-resource', null, function (release) {
		    var stream = GetStream();
		    stream.on('end', release);
		   	callback(stream);
		});
	});

Note that this introduces risk of a lock never being released, if, for example, the stream never emits 'end.' You can address this with a failsafe:

    var lock = new Lock(10000); // 10 second maximum time to hold a lock

The same code above is safe now: if 10 seconds pass, the lock will be released. When a lock times out, the release callback will be invoked with an `Error` argument. If you need to do some cleanup or special handling when the timeout occurs, use the *releaseCallback* to deal with this:

	function GetStream(err, callback) {	
        var stream;

		function released(err) {
			if (err) {
                stream.abort();
                logger.warn("Stream timed out")
            }
		}

		lock.readLock(key, released, function (release) {
		    stream = GetStream();
		    stream.on('end', release);
		    callback(stream);
		});
	});

The workflow here is:

* When lock is obtained, `callback` is immediately invoked with the stream.
* When the stream `end` event fires, the lock is released. This also invokes `released` but with no argument.
* If 10 seconds pass before the stream `end` event fires, `released` is invoked with an Error.

Note that it's entirely possible that the `end` event could later fire after a timeout in this code, causing `release` to be invoked again. While it probably should be improved to prevent this by unbinding the event in that scenario, if `release` should be called again, nothing will happen: the `lockReleased` callback will never be invoked more than once by rwlock-plus even if the `release` method is called multiple times.   

